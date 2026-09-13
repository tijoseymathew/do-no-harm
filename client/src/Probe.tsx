import { useEffect, useRef, useState } from "react";
import {
  StudentCaseSchema,
  type StudentCase,
} from "../../shared/contracts/student.js";

type ConnectionState =
  | "idle"
  | "connecting"
  | "connected"
  | "closing"
  | "error";

interface LiveSessionResult {
  session: { id: string };
  transport: { type: "webrtc"; sdp: string };
}

async function waitForIce(connection: RTCPeerConnection) {
  if (connection.iceGatheringState === "complete") return;
  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      connection.removeEventListener("icegatheringstatechange", onState);
      reject(new Error("Timed out while gathering ICE candidates"));
    }, 10_000);
    function onState() {
      if (connection.iceGatheringState !== "complete") return;
      window.clearTimeout(timeout);
      connection.removeEventListener("icegatheringstatechange", onState);
      resolve();
    }
    connection.addEventListener("icegatheringstatechange", onState);
    onState();
  });
}

export function Probe() {
  const [caseData, setCaseData] = useState<StudentCase>();
  const [connection, setConnection] = useState<ConnectionState>("idle");
  const [status, setStatus] = useState(
    "Ready to start the real GPT-Live probe.",
  );
  const [eventsSeen, setEventsSeen] = useState<string[]>([]);
  const peerRef = useRef<RTCPeerConnection | undefined>(undefined);
  const channelRef = useRef<RTCDataChannel | undefined>(undefined);
  const microphoneRef = useRef<MediaStream | undefined>(undefined);
  const audioRef = useRef<HTMLAudioElement>(null);
  const closeTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    fetch("/api/cases/current")
      .then(async (response) => {
        if (!response.ok) throw new Error("Case endpoint unavailable");
        return StudentCaseSchema.parse(await response.json());
      })
      .then(setCaseData)
      .catch((error: unknown) =>
        setStatus(
          error instanceof Error ? error.message : "Unable to load case",
        ),
      );
    return () => cleanup();
  }, []);

  function cleanup() {
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    microphoneRef.current?.getTracks().forEach((track) => track.stop());
    channelRef.current?.close();
    peerRef.current?.close();
    if (audioRef.current) audioRef.current.srcObject = null;
    microphoneRef.current = undefined;
    channelRef.current = undefined;
    peerRef.current = undefined;
  }

  async function startConversation() {
    setConnection("connecting");
    setEventsSeen([]);
    setStatus("Requesting microphone access…");
    try {
      const peer = new RTCPeerConnection();
      peerRef.current = peer;
      peer.addEventListener("track", (event) => {
        if (!audioRef.current) return;
        audioRef.current.srcObject = new MediaStream([event.track]);
        void audioRef.current
          .play()
          .catch(() =>
            setStatus(
              "Connected. Select play on the audio control to hear Patient.",
            ),
          );
      });

      const microphone = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      microphoneRef.current = microphone;
      microphone
        .getAudioTracks()
        .forEach((track) => peer.addTrack(track, microphone));

      const channel = peer.createDataChannel("oai-events");
      channelRef.current = channel;
      channel.addEventListener("message", ({ data }) => {
        const event = JSON.parse(String(data)) as {
          type?: string;
          session?: { id?: string };
        };
        const type = event.type ?? "unknown";
        setEventsSeen((current) => [...current.slice(-7), type]);
        if (type === "session.started") {
          setConnection("connected");
          setStatus(
            `Connected to a real session (${event.session?.id ?? "opaque id"}). Speak to Patient; interrupt while Patient replies to verify full duplex.`,
          );
        } else if (type === "session.closed") {
          cleanup();
          setConnection("idle");
          setStatus("Conversation ended with a final session event.");
        }
      });
      channel.addEventListener("close", () => {
        if (connection !== "closing") {
          setConnection("idle");
        }
      });

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      await waitForIce(peer);
      const sdp = peer.localDescription?.sdp;
      if (!sdp) throw new Error("Browser did not produce an SDP offer");

      setStatus("Creating a server-authenticated GPT-Live session…");
      const response = await fetch("/api/live/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sdp }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(
          body.error ?? `Session creation failed (${response.status})`,
        );
      }
      const result = (await response.json()) as LiveSessionResult;
      await peer.setRemoteDescription({
        type: "answer",
        sdp: result.transport.sdp,
      });
    } catch (error) {
      cleanup();
      setConnection("error");
      setStatus(error instanceof Error ? error.message : "Unable to connect");
    }
  }

  function endConversation() {
    const channel = channelRef.current;
    if (!channel || channel.readyState !== "open") return;
    setConnection("closing");
    setStatus("Closing gracefully…");
    channel.send(JSON.stringify({ type: "session.close" }));
    closeTimerRef.current = window.setTimeout(() => {
      cleanup();
      setConnection("error");
      setStatus("Session closed without a final session.closed event.");
    }, 15_000);
  }

  return (
    <main>
      <header>
        <p className="eyebrow">FOUNDATION / REAL API PROBE</p>
        <h1>DO NO HARM</h1>
        <p className="lede">
          A minimal, student-visible voice connection. No hidden rubric or
          provider credential is sent to this page.
        </p>
      </header>

      <section className="case-card" aria-labelledby="case-heading">
        <div>
          <p className="label">SIMULATION CASE</p>
          <h2 id="case-heading">{caseData?.title ?? "Loading case…"}</h2>
          {caseData && (
            <p>
              {caseData.patient.displayName}, {caseData.patient.ageYears} ·{" "}
              {caseData.patient.presentingComplaint}
            </p>
          )}
        </div>
        <span className="review">
          {caseData?.clinicalReviewStatus.replaceAll("_", " ") ?? "checking"}
        </span>
      </section>

      <section className="probe" aria-labelledby="probe-heading">
        <div className="pulse" data-state={connection} aria-hidden="true" />
        <div>
          <p className="label">PATIENT · GPT-LIVE-1</p>
          <h2 id="probe-heading">Browser conversation probe</h2>
          <p className="status" role="status">
            {status}
          </p>
        </div>
        <div className="controls">
          <button
            onClick={() => void startConversation()}
            disabled={
              connection === "connecting" ||
              connection === "connected" ||
              connection === "closing"
            }
          >
            Start conversation
          </button>
          <button
            className="secondary"
            onClick={endConversation}
            disabled={connection !== "connected"}
          >
            End conversation
          </button>
        </div>
        <audio ref={audioRef} autoPlay controls aria-label="Patient audio" />
        <div className="instructions">
          <h3>Interruption check</h3>
          <p>
            After Patient begins a longer reply, speak naturally over it. Pass
            only if Patient stops, listens, and responds to the interruption.
          </p>
        </div>
        <div className="event-log" aria-label="Recent provider event types">
          {eventsSeen.length ? (
            eventsSeen.map((event, index) => (
              <code key={`${event}-${index}`}>{event}</code>
            ))
          ) : (
            <span>No provider events yet</span>
          )}
        </div>
      </section>
    </main>
  );
}
