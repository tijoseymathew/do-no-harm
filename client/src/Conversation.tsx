import { useEffect, useRef, useState } from "react";
import type {
  ConversationMessage,
  ConversationSnapshot,
  ConversationTurnResult,
} from "../../shared/contracts/conversation.js";
import { LiveDelegationBridge } from "./live-delegation.js";

interface Props {
  runId: string;
  briefing: string;
  conversation: ConversationSnapshot;
  busy: boolean;
  sendText: (text: string, source: "text" | "voice", interrupted?: boolean, expectedRunId?: string) => Promise<ConversationTurnResult | undefined>;
  correct: (messageId: string, text: string) => Promise<void>;
  checkpoint: () => Promise<void>;
  registerFinishFlush?: (flush: () => string) => void;
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
  registerFinishFlush,
}: Props) {
  const [text, setText] = useState("");
  const [editing, setEditing] = useState<ConversationMessage | null>(null);
  const [correction, setCorrection] = useState("");
  const [liveStatus, setLiveStatus] = useState<LiveStatus>("disconnected");
  const [liveMessage, setLiveMessage] = useState("Voice disconnected — continue by text.");
  const [liveCaption, setLiveCaption] = useState("");
  const [inputCaption, setInputCaption] = useState("");
  const [micMuted, setMicMuted] = useState(false);
  const peer = useRef<RTCPeerConnection | undefined>(undefined);
  const channel = useRef<RTCDataChannel | undefined>(undefined);
  const microphone = useRef<MediaStream | undefined>(undefined);
  const audio = useRef<HTMLAudioElement>(null);
  const transcript = useRef("");
  const transcriptTimer = useRef<number | undefined>(undefined);
  const bridge = useRef<LiveDelegationBridge | undefined>(undefined);
  const transcriptVersion = useRef(0);
  const voiceQueue = useRef<Promise<void>>(Promise.resolve());
  const liveSessionId = useRef<string | undefined>(undefined);
  const attempt = useRef(0);
  const connectionTimer = useRef<number | undefined>(undefined);

  useEffect(() => () => disconnect(), []);
  useEffect(() => {
    registerFinishFlush?.(() => {
      if (transcriptTimer.current) window.clearTimeout(transcriptTimer.current);
      const complete = transcript.current.trim();
      transcript.current = "";
      setInputCaption("");
      disconnect();
      return complete;
    });
  }, [registerFinishFlush]);

  function disconnect() {
    attempt.current++;
    window.clearTimeout(connectionTimer.current);
    if (transcriptTimer.current) window.clearTimeout(transcriptTimer.current);
    bridge.current?.close();
    bridge.current = undefined;
    if (channel.current?.readyState === "open")
      channel.current.send(JSON.stringify({ type: "session.close" }));
    const sessionId = liveSessionId.current;
    liveSessionId.current = undefined;
    if (sessionId) void fetch(`/api/conversations/${runId}/live/status`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, status: "disconnected" }),
      keepalive: true,
    }).catch(() => undefined);
    microphone.current?.getTracks().forEach((track) => track.stop());
    channel.current?.close();
    peer.current?.close();
    if (audio.current) audio.current.srcObject = null;
    microphone.current = undefined;
    channel.current = undefined;
    peer.current = undefined;
  }

  function flushVoice() {
    if (transcriptTimer.current) window.clearTimeout(transcriptTimer.current);
    const complete = transcript.current.trim();
    transcript.current = "";
    setInputCaption("");
    if (!complete) return;
    const currentBridge = bridge.current;
    const version = transcriptVersion.current;
    voiceQueue.current = voiceQueue.current.then(async () => {
      const result = await sendText(complete, "voice", false, runId);
      const answer = result?.conversation.messages.at(-1);
      currentBridge?.resolve(version, answer && ["nurse", "patient"].includes(answer.role)
        ? `${answer.role}: ${answer.text}`
        : "The application could not verify this request. Ask the learner to use the bedside controls or text. Do not invent an answer or claim an action succeeded.");
    }).catch(() => {
      currentBridge?.resolve(version, "The application is unavailable. Ask the learner to continue by text; do not claim success.");
    });
  }

  async function connect() {
    disconnect();
    const currentAttempt = attempt.current;
    transcript.current = "";
    setInputCaption("");
    setLiveCaption("");
    setMicMuted(false);
    setLiveStatus("connecting");
    setLiveMessage("Requesting microphone and connecting…");
    connectionTimer.current = window.setTimeout(() => {
      disconnect();
      setLiveStatus("failed");
      setLiveMessage("Voice connection timed out. Continue by text or reconnect.");
    }, 40000);
    try {
      const connection = new RTCPeerConnection();
      peer.current = connection;
      connection.addEventListener("track", ({ track }) => {
        if (!audio.current) return;
        audio.current.srcObject = new MediaStream([track]);
        void audio.current.play().catch(() => setLiveMessage("Audio playback was blocked. Reconnect voice to enable sound."));
      });
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (peer.current !== connection) {
        media.getTracks().forEach((track) => track.stop());
        return;
      }
      microphone.current = media;
      media.getTracks().forEach((track) => connection.addTrack(track, media));
      const events = connection.createDataChannel("oai-events");
      channel.current = events;
      bridge.current = new LiveDelegationBridge((event) => {
        if (events.readyState === "open") events.send(JSON.stringify(event));
      });
      events.addEventListener("message", ({ data }) => {
        if (peer.current !== connection) return;
        let event: {
          type?: string;
          delta?: string;
          delegation?: { id?: string; target?: string };
        };
        try { event = JSON.parse(String(data)); } catch { return; }
        if (event.type === "session.started") {
          window.clearTimeout(connectionTimer.current);
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
          transcriptVersion.current = bridge.current?.inputChanged() ?? 0;
          setInputCaption(transcript.current);
          setLiveCaption("");
          if (transcriptTimer.current) window.clearTimeout(transcriptTimer.current);
          transcriptTimer.current = window.setTimeout(flushVoice, 900);
        }
        if (event.type === "session.delegation.created" && event.delegation?.target === "client" && event.delegation.id)
          bridge.current?.delegate(event.delegation.id);
        if (event.type === "session.output_transcript.delta" && event.delta)
          setLiveCaption((current) => `${current}${event.delta}`);
        if (event.type === "session.closed") {
          flushVoice();
          disconnect();
          setLiveStatus("disconnected");
          setLiveMessage("Voice session ended — continue by text.");
        }
        if (event.type === "error") {
          flushVoice();
          disconnect();
          setLiveStatus("failed");
          setLiveMessage("Voice interrupted. Accepted actions and transcript are preserved; continue by text or reconnect.");
        }
      });
      events.addEventListener("close", () => {
        if (peer.current !== connection) return;
        flushVoice();
        disconnect();
        setLiveStatus((current) => (current === "failed" ? current : "disconnected"));
        setLiveMessage("Voice disconnected — continue by text or reconnect.");
      });
      connection.addEventListener("connectionstatechange", () => {
        if (peer.current === connection && connection.connectionState === "failed") {
          flushVoice();
          disconnect();
          setLiveStatus("failed");
          setLiveMessage("Voice connection lost. Continue by text or reconnect.");
        }
      });
      const offer = await connection.createOffer();
      await connection.setLocalDescription(offer);
      await waitForIce(connection);
      const sdp = connection.localDescription?.sdp;
      if (!sdp) throw new Error("No browser SDP offer was produced");
      const response = await fetch("/api/live/session", {
        signal: AbortSignal.timeout(30000),
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId, sdp }),
      });
      if (!response.ok) {
        const result = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(result.error ?? "Voice connection failed");
      }
      const result = (await response.json()) as { session: { id: string }; transport: { sdp: string } };
      if (peer.current !== connection) return;
      liveSessionId.current = result.session.id;
      await connection.setRemoteDescription({ type: "answer", sdp: result.transport.sdp });
    } catch (error) {
      if (attempt.current !== currentAttempt) return;
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
          <p className="eyebrow">GPT-LIVE-1 · LIVE CONVERSATION</p>
          <h2>Conversation and captions</h2>
        </div>
        <div className="live-controls">
          <button className="secondary" disabled={liveStatus === "connecting" || liveStatus === "connected"} onClick={() => void connect()}>
            {liveStatus === "failed" ? "Reconnect voice" : "Connect voice"}
          </button>
          <button className="secondary" disabled={liveStatus !== "connected"} onClick={() => {
            const next = !micMuted;
            microphone.current?.getAudioTracks().forEach((track) => { track.enabled = !next; });
            if (channel.current?.readyState === "open") channel.current.send(JSON.stringify({ type: next ? "session.input_audio.mute" : "session.input_audio.unmute" }));
            setMicMuted(next);
            setLiveMessage(next ? "Microphone muted. Unmute to speak." : "Voice connected. Speak to interrupt naturally.");
          }}>{micMuted ? "Unmute microphone" : "Mute microphone"}</button>
          <button className="secondary" disabled={liveStatus !== "connected" && liveStatus !== "connecting"} onClick={() => {
            flushVoice();
            disconnect();
            setLiveStatus("disconnected");
            setLiveMessage("Voice disconnected — continue by text.");
          }}>Disconnect voice</button>
        </div>
      </div>
      <p className={`connection-state ${liveStatus}`} role="status">{liveMessage}</p>
      <audio ref={audio} autoPlay className="live-audio" aria-label="Live Nurse, Patient, and Examiner audio" />
      {inputCaption && <p className="live-caption"><strong>YOU · LIVE</strong> {inputCaption}</p>}
      {liveCaption && <p className="live-caption"><strong>PATIENT / NURSE · LIVE</strong> {liveCaption}</p>}
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
        <span>EXAMINER · {conversation.examiner.mode === "real" ? "ASTRA · AGENTS API" : "VERIFICATION FIXTURE"}</span>
        <button className="secondary" disabled={busy || conversation.examiner.followUpDelivered || conversation.examiner.status === "running"} onClick={() => void checkpoint()}>
          Enter reasoning checkpoint
        </button>
        {conversation.examiner.message && <small>{conversation.examiner.message}</small>}
      </div>
      <details><summary>Transcript</summary><p>Corrections append new evidence and preserve the original segment. Answers after an examiner prompt are marked assisted.</p></details>
    </section>
  );
}
