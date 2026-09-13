import { useEffect, useRef, useState } from "react";
import type {
  ConversationMessage,
  ConversationSnapshot,
} from "../../shared/contracts/conversation.js";

interface Props {
  runId: string;
  briefing: string;
  conversation: ConversationSnapshot;
  busy: boolean;
  sendText: (text: string, source: "text" | "voice", interrupted?: boolean) => Promise<void>;
  correct: (messageId: string, text: string) => Promise<void>;
  checkpoint: () => Promise<void>;
}

type LiveStatus = "disconnected" | "connecting" | "connected" | "failed";

async function waitForIce(peer: RTCPeerConnection) {
  if (peer.iceGatheringState === "complete") return;
  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error("Timed out gathering ICE candidates")), 10_000);
    const change = () => {
      if (peer.iceGatheringState !== "complete") return;
      window.clearTimeout(timeout);
      peer.removeEventListener("icegatheringstatechange", change);
      resolve();
    };
    peer.addEventListener("icegatheringstatechange", change);
  });
}

export function Conversation({
  runId,
  briefing,
  conversation,
  busy,
  sendText,
  correct,
  checkpoint,
}: Props) {
  const [text, setText] = useState("");
  const [editing, setEditing] = useState<ConversationMessage | null>(null);
  const [correction, setCorrection] = useState("");
  const [liveStatus, setLiveStatus] = useState<LiveStatus>("disconnected");
  const [liveMessage, setLiveMessage] = useState("Voice disconnected — continue by text.");
  const [liveCaption, setLiveCaption] = useState("");
  const peer = useRef<RTCPeerConnection | undefined>(undefined);
  const channel = useRef<RTCDataChannel | undefined>(undefined);
  const microphone = useRef<MediaStream | undefined>(undefined);
  const audio = useRef<HTMLAudioElement>(null);
  const transcript = useRef("");
  const transcriptTimer = useRef<number | undefined>(undefined);

  useEffect(() => () => disconnect(), []);

  function disconnect() {
    if (transcriptTimer.current) window.clearTimeout(transcriptTimer.current);
    microphone.current?.getTracks().forEach((track) => track.stop());
    channel.current?.close();
    peer.current?.close();
    if (audio.current) audio.current.srcObject = null;
    microphone.current = undefined;
    channel.current = undefined;
    peer.current = undefined;
  }

  async function connect() {
    setLiveStatus("connecting");
    setLiveMessage("Requesting microphone and connecting…");
    try {
      const connection = new RTCPeerConnection();
      peer.current = connection;
      connection.addEventListener("track", ({ track }) => {
        if (!audio.current) return;
        audio.current.srcObject = new MediaStream([track]);
        void audio.current.play();
      });
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      microphone.current = media;
      media.getTracks().forEach((track) => connection.addTrack(track, media));
      const events = connection.createDataChannel("oai-events");
      channel.current = events;
      events.addEventListener("message", ({ data }) => {
        const event = JSON.parse(String(data)) as {
          type?: string;
          delta?: string;
        };
        if (event.type === "session.started") {
          setLiveStatus("connected");
          setLiveMessage("Voice connected. Interrupt naturally at any time.");
          events.send(
            JSON.stringify({
              type: "session.commentary.append",
              delegation_id: null,
              content: `Nurse — say this authored briefing verbatim: ${briefing}`,
            }),
          );
        }
        if (event.type === "session.input_transcript.delta" && event.delta) {
          transcript.current += event.delta;
          setLiveCaption(transcript.current);
          if (transcriptTimer.current) window.clearTimeout(transcriptTimer.current);
          transcriptTimer.current = window.setTimeout(() => {
            const complete = transcript.current.trim();
            transcript.current = "";
            setLiveCaption("");
            if (complete) void sendText(complete, "voice");
          }, 900);
        }
        if (event.type === "session.output_transcript.delta" && event.delta)
          setLiveCaption((current) => `${current}${event.delta}`);
        if (event.type === "session.closed") {
          disconnect();
          setLiveStatus("disconnected");
          setLiveMessage("Voice session ended — continue by text.");
        }
        if (event.type === "error") {
          setLiveStatus("failed");
          setLiveMessage("Voice interrupted. Accepted actions and transcript are preserved; continue by text or reconnect.");
        }
      });
      events.addEventListener("close", () => {
        setLiveStatus((current) => (current === "failed" ? current : "disconnected"));
      });
      const offer = await connection.createOffer();
      await connection.setLocalDescription(offer);
      await waitForIce(connection);
      const sdp = connection.localDescription?.sdp;
      if (!sdp) throw new Error("No browser SDP offer was produced");
      const response = await fetch("/api/live/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId, sdp }),
      });
      if (!response.ok) {
        const result = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(result.error ?? "Voice connection failed");
      }
      const result = (await response.json()) as { transport: { sdp: string } };
      await connection.setRemoteDescription({ type: "answer", sdp: result.transport.sdp });
    } catch (error) {
      disconnect();
      setLiveStatus("failed");
      setLiveMessage(
        `${error instanceof Error ? error.message : "Voice connection failed"}. Accepted actions are preserved; continue by text.`,
      );
    }
  }

  function submitText(event: React.SubmitEvent) {
    event.preventDefault();
    const value = text.trim();
    if (!value) return;
    setText("");
    void sendText(value, "text");
  }

  return (
    <section className="conversation" aria-label="Live conversation and captions">
      <div className="conversation-heading">
        <div>
          <p className="eyebrow">LIVE CONVERSATION</p>
          <h2>Conversation and captions</h2>
        </div>
        <div className="live-controls">
          <button className="secondary" disabled={liveStatus === "connecting" || liveStatus === "connected"} onClick={() => void connect()}>
            {liveStatus === "failed" ? "Reconnect voice" : "Connect voice"}
          </button>
          <button className="secondary" disabled={liveStatus !== "connected"} onClick={() => {
            channel.current?.send(JSON.stringify({ type: "session.input_audio.mute" }));
            setLiveMessage("Nurse/Patient interrupted; listening for your correction.");
          }}>Interrupt</button>
        </div>
      </div>
      <p className={`connection-state ${liveStatus}`} role="status">{liveMessage}</p>
      <audio ref={audio} autoPlay className="live-audio" aria-label="Live Nurse, Patient, and Examiner audio" />
      {liveCaption && <p className="live-caption"><strong>LIVE · VOICE</strong> {liveCaption}</p>}
      <ol className="transcript-list" aria-label="Transcript">
        {conversation.messages.map((message) => (
          <li key={message.id} className={message.supersededByMessageId ? "superseded" : ""}>
            {message.role === "examiner" && <i className="sr-only">examiner</i>}
            <span>{message.role.toUpperCase()} · {message.source.toUpperCase()}</span>
            <p>{message.text}</p>
            <small>
              {message.supersededByMessageId && "superseded by correction · "}
              {message.correctsMessageId && "correction preserved · "}
              {message.assisted ? "assisted response" : "unassisted decision"}
              {message.interrupted && " · interrupted"}
            </small>
            {message.role === "student" && !message.supersededByMessageId && (
              <button className="text-button" onClick={() => {
                setEditing(message);
                setCorrection(message.text);
              }}>Correct</button>
            )}
          </li>
        ))}
      </ol>
      {editing && (
        <form className="correction" onSubmit={(event) => {
          event.preventDefault();
          void correct(editing.id, correction).then(() => setEditing(null));
        }}>
          <label>Correct transcript<textarea value={correction} onChange={(event) => setCorrection(event.target.value)} /></label>
          <button disabled={!correction.trim()}>Save correction</button>
          <button className="secondary" type="button" onClick={() => setEditing(null)}>Cancel</button>
        </form>
      )}
      <form className="text-fallback" onSubmit={submitText}>
        <label>Continue by text<input value={text} onChange={(event) => setText(event.target.value)} placeholder="Ask the patient or state your plan" /></label>
        <button disabled={busy || !text.trim()}>Send</button>
      </form>
      <div className="examiner-checkpoint">
        <span>EXAMINER · {conversation.examiner.mode === "real" ? "ASTRA" : "VERIFICATION FIXTURE"}</span>
        <button className="secondary" disabled={busy || conversation.examiner.followUpDelivered || conversation.examiner.status === "running"} onClick={() => void checkpoint()}>
          Enter reasoning checkpoint
        </button>
        {conversation.examiner.message && <small>{conversation.examiner.message}</small>}
      </div>
      <details><summary>Transcript</summary><p>Corrections append new evidence and preserve the original segment. Answers after an examiner prompt are marked assisted.</p></details>
    </section>
  );
}
