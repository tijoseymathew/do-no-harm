import { useCallback, useEffect, useRef, useState } from "react";
import {
  StudentCaseSchema,
  type StudentCase,
} from "../../shared/contracts/student.js";
import type {
  ScenarioCommand,
  ScenarioSnapshot,
} from "../../shared/contracts/scenario.js";
import type {
  ConversationSnapshot,
  ConversationTurnResult,
} from "../../shared/contracts/conversation.js";
import { Room, stations, type Station } from "./Room.js";
import { Monitor } from "./Monitor.js";
import { Medication } from "./Medication.js";
import { Probe } from "./Probe.js";
import { Assessment } from "./Assessment.js";
import { Investigations } from "./Investigations.js";
import { OxygenIv } from "./OxygenIv.js";
import { Notes } from "./Notes.js";
import { CallStation } from "./CallStation.js";
import { Conversation } from "./Conversation.js";
import { Debrief } from "./Debrief.js";
import type { DebriefSnapshot } from "../../shared/contracts/debrief.js";

class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly state?: ScenarioSnapshot,
  ) {
    super(message);
  }
}

async function json<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(10000),
    ...(body === undefined
      ? {}
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
  const responseText = await response.text();
  if (!responseText.trim()) {
    const message =
      response.status === 401 || response.status === 403
        ? "The hosted session could not authorize this request. Reopen the site from ChatGPT and try again."
        : `The server returned an empty response (HTTP ${response.status}). Try again.`;
    throw new ApiError(message, response.status);
  }
  let result: unknown;
  try {
    result = JSON.parse(responseText);
  } catch {
    throw new ApiError(
      `The server returned an invalid response (HTTP ${response.status}). Try again.`,
      response.status,
    );
  }
  if (!response.ok) {
    const failure = result as { error?: unknown; state?: ScenarioSnapshot };
    throw new ApiError(
      typeof failure.error === "string" ? failure.error : "Server unavailable",
      response.status,
      failure.state,
    );
  }
  return result as T;
}
export function App() {
  if (window.location.pathname === "/probe") return <Probe />;
  return <Bedside />;
}
function Bedside() {
  const [patient, setPatient] = useState<StudentCase>();
  const [state, setState] = useState<ScenarioSnapshot>();
  const [conversation, setConversation] = useState<ConversationSnapshot>();
  const [debrief, setDebrief] = useState<DebriefSnapshot>();
  const [selected, setSelected] = useState<Station>("Patient");
  const [syncLost, setSyncLost] = useState(false);
  const [reduced, setReduced] = useState(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [muted, setMuted] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const authoritative = useRef<ScenarioSnapshot>(undefined);
  const locked = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const audio = useRef<AudioContext>(undefined);
  const noteDraft = useRef("");
  const finishTranscript = useRef<() => string>(() => "");
  const select = useCallback((station: Station) => {
    setSelected(station);
    requestAnimationFrame(() => heading.current?.focus({ preventScroll: true }));
  }, []);
  useEffect(() => {
    let active = true;
    void Promise.all([
      json<unknown>("/api/cases/current").then((value) =>
        StudentCaseSchema.parse(value),
      ),
      json<ScenarioSnapshot>("/api/runs", {}).then(async (snapshot) => ({
        snapshot,
        conversation: await json<ConversationSnapshot>(`/api/conversations/${snapshot.id}`),
      })),
    ])
      .then(([p, result]) => {
        if (active) {
          setPatient(p);
          setState(result.snapshot);
          setConversation(result.conversation);
          authoritative.current = result.snapshot;
        }
      })
      .catch((e) => {
        if (active)
          setError(e instanceof Error ? e.message : "Unable to load bedside");
      });
    return () => {
      active = false;
    };
  }, []);
  const resetScenario = useCallback(async () => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    try {
      const snapshot = await json<ScenarioSnapshot>("/api/runs", {});
      const nextConversation = await json<ConversationSnapshot>(
        `/api/conversations/${snapshot.id}`,
      );
      authoritative.current = snapshot;
      noteDraft.current = "";
      finishTranscript.current = () => "";
      setState(snapshot);
      setConversation(nextConversation);
      setDebrief(undefined);
      setSelected("Patient");
      setSyncLost(false);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scenario reset failed");
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    const query = matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setReduced(query.matches);
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, []);
  const send = useCallback(async (command: ScenarioCommand) => {
    const s = authoritative.current;
    if (!s || locked.current) return false;
    locked.current = true;
    setBusy(true);
    try {
      const updated = await json<ScenarioSnapshot>(
        `/api/runs/${s.id}/commands`,
        {
          revision: s.revision,
          idempotencyKey: crypto.randomUUID(),
          command,
        },
      );
      authoritative.current = updated;
      setState(updated);
      if (command.type === "record_handoff") {
        const result = await json<{
          conversation: ConversationSnapshot;
        }>(`/api/conversations/${updated.id}/checkpoints`, { kind: "handoff" });
        setConversation(result.conversation);
      }
      setError("");
      setSyncLost(false);
      return true;
    } catch (e) {
      if (e instanceof ApiError && e.status === 422 && e.state) {
        authoritative.current = e.state;
        setState(e.state);
        setError(e.message);
        return false;
      }
      setSyncLost(true);
      setError(
        `${e instanceof Error ? e.message : "Connection lost"} Simulation paused locally. Refresh state before continuing.`,
      );
      return false;
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }, []);
  const sendText = useCallback(async (
    text: string,
    source: "text" | "voice",
    interrupted = false,
  ) => {
    const current = authoritative.current;
    if (!current) return;
    setBusy(true);
    try {
      const result = await json<ConversationTurnResult & { state: ScenarioSnapshot }>(
        `/api/conversations/${current.id}/turns`,
        { text, source, interrupted },
      );
      authoritative.current = result.state;
      setState(result.state);
      setConversation(result.conversation);
      if (result.focusStation) select(result.focusStation);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Conversation unavailable");
    } finally {
      setBusy(false);
    }
  }, [select]);
  const correctTranscript = useCallback(async (messageId: string, text: string) => {
    const current = authoritative.current;
    if (!current) return;
    const result = await json<ConversationSnapshot>(
      `/api/conversations/${current.id}/corrections`,
      { messageId, text },
    );
    setConversation(result);
  }, []);
  const requestReasoningCheckpoint = useCallback(async () => {
    const current = authoritative.current;
    if (!current) return;
    setBusy(true);
    try {
      const result = await json<{ conversation: ConversationSnapshot }>(
        `/api/conversations/${current.id}/checkpoints`,
        { kind: "reasoning" },
      );
      setConversation(result.conversation);
    } finally {
      setBusy(false);
    }
  }, []);
  const clearMedicationDraft = useCallback(async () => {
    const current = authoritative.current;
    if (!current) return;
    const result = await json<ConversationSnapshot>(
      `/api/conversations/${current.id}/draft/clear`,
      {},
    );
    setConversation(result);
  }, []);
  const finish = useCallback(async () => {
    const current = authoritative.current;
    if (!current) return;
    setBusy(true);
    try {
      const result = await json<DebriefSnapshot>(`/api/debriefs/${current.id}/finish`, {
        noteContent: noteDraft.current || null,
        pendingTranscript: finishTranscript.current() || null,
      });
      const updated = await json<ScenarioSnapshot>(`/api/runs/${current.id}`);
      authoritative.current = updated;
      setState(updated);
      setDebrief(result);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Finish failed");
    } finally {
      setBusy(false);
    }
  }, []);
  const retryDebrief = useCallback(async () => {
    const current = authoritative.current;
    if (!current) return;
    setBusy(true);
    try { setDebrief(await json<DebriefSnapshot>(`/api/debriefs/${current.id}/retry`, {})); }
    catch (e) { setError(e instanceof Error ? e.message : "Evaluation retry failed"); }
    finally { setBusy(false); }
  }, []);
  const requestTeachBack = useCallback(async () => {
    const current = authoritative.current;
    if (!current) return;
    setBusy(true);
    try {
      setDebrief(await json<DebriefSnapshot>(`/api/debriefs/${current.id}/teach-back`, {}));
      setConversation(await json<ConversationSnapshot>(`/api/conversations/${current.id}`));
    } finally { setBusy(false); }
  }, []);
  useEffect(() => {
    if (syncLost || !state?.clock.running) return;
    const timer = setInterval(
      () => void send({ type: "advance", seconds: 1 }),
      1000,
    );
    return () => clearInterval(timer);
  }, [syncLost, state?.clock.running, send]);
  useEffect(() => {
    if (!debrief || debrief.status !== "evaluating") return;
    const timer = window.setInterval(() => {
      void json<DebriefSnapshot>(`/api/debriefs/${debrief.runId}`)
        .then((result) => setDebrief(result))
        .catch(() => undefined);
    }, 500);
    return () => window.clearInterval(timer);
  }, [debrief?.runId, debrief?.status]);
  useEffect(() => {
    if (muted || syncLost || !state?.clock.running || !state.sensors.ecg) return;
    const timer = setInterval(() => {
      const ctx = audio.current;
      if (!ctx) return;
      const tone = ctx.createOscillator();
      const gain = ctx.createGain();
      tone.frequency.value = 660;
      gain.gain.setValueAtTime(0.025, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.065);
      tone.connect(gain);
      gain.connect(ctx.destination);
      tone.start();
      tone.stop(ctx.currentTime + 0.07);
    }, 60000 / state.physiology.heartRate);
    return () => clearInterval(timer);
  }, [
    muted,
    syncLost,
    state?.clock.running,
    state?.sensors.ecg,
    state?.physiology.heartRate,
  ]);
  useEffect(
    () => () => {
      void audio.current?.close();
    },
    [],
  );
  async function refresh() {
    if (!state || locked.current) return;
    locked.current = true;
    setBusy(true);
    try {
      const s = await json<ScenarioSnapshot>(`/api/runs/${state.id}`);
      authoritative.current = s;
      setState(s);
      setError("");
      setSyncLost(false);
    } catch {
      setError(
        "Server unavailable. Simulation remains paused locally; try Refresh state again.",
      );
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  return (
    <main className="simulator">
      <header className="topbar">
        <div>
          <p className="eyebrow">BEDSIDE PRACTICE / BAY 01</p>
          <h1>
            DO NO HARM<span>Interaction lab</span>
          </h1>
        </div>
        <div className="toolbar">
          <span className="clock" aria-label="Simulation time">
            {Math.floor((state?.clock.simulationTimeMs ?? 0) / 60000)
              .toString()
              .padStart(2, "0")}
            :
            {Math.floor(((state?.clock.simulationTimeMs ?? 0) / 1000) % 60)
              .toString()
              .padStart(2, "0")}
          </span>
          <button
            className="secondary"
            disabled={!state || busy || syncLost || state.lifecycle === "ended"}
            onClick={() =>
              void send({ type: state?.clock.running ? "pause" : "resume" })
            }
          >
            {state?.clock.running ? "Pause" : "Resume"}
          </button>
          <button
            className="secondary"
            aria-pressed={muted}
            onClick={() => {
              if (muted) {
                audio.current ??= new AudioContext();
                void audio.current.resume();
              }
              setMuted(!muted);
            }}
          >
            {muted ? "Sound muted" : "Mute sound"}
          </button>
          <button
            className="secondary"
            disabled={!state || busy || syncLost || !state.clock.running}
            onClick={() => void send({ type: "advance", seconds: 30 })}
          >
            Advance scenario +30 s
          </button>
          <button
            className="secondary"
            disabled={!state || busy}
            onClick={() => void resetScenario()}
          >
            Reset scenario
          </button>
          <button
            className="finish"
            disabled={!state || busy || syncLost || !state.handoffs.length || state.lifecycle === "ended"}
            onClick={() => void finish()}
          >
            Finish
          </button>
          <label className="motion">
            <input
              type="checkbox"
              checked={reduced}
              onChange={(e) => setReduced(e.target.checked)}
            />
            Reduced motion
          </label>
        </div>
      </header>
      <div className="fixture-banner">
        DETERMINISTIC ENGINE · DEVELOPMENT RULES{" "}
        <span>
          Server-authoritative state and effects · clinical content unreviewed
        </span>
        <a href="/probe">API probe ↗</a>
      </div>
      {error && (
        <div className="error" role="alert">
          {error}{" "}
          {state && syncLost && (
            <button onClick={() => void refresh()} disabled={busy}>
              Refresh state
            </button>
          )}
        </div>
      )}
      {state && patient ? (
        <>
          {debrief ? <Debrief
            debrief={debrief}
            conversation={conversation}
            busy={busy}
            retry={retryDebrief}
            teachBack={requestTeachBack}
            answerTeachBack={(text) => sendText(text, "text")}
            correctTranscript={async (messageId, text) => {
              await correctTranscript(messageId, text);
              const current = authoritative.current;
              if (current) setConversation(await json<ConversationSnapshot>(`/api/conversations/${current.id}`));
            }}
          /> : <>
          <div className="workspace">
            <Room
              selected={selected}
              select={select}
              state={state}
              reduced={reduced}
              paused={!state.clock.running || syncLost}
            />
            <aside>
              <Monitor
                state={state}
                paused={!state.clock.running || syncLost}
                reduced={reduced}
              />
              <section className="equipment" aria-label="Active equipment">
                <div className="panel-heading">
                  <h2 ref={heading} tabIndex={-1}>
                    {selected}
                  </h2>
                  <span className="tag">BEDSIDE</span>
                </div>
                {selected === "Patient" && (
                  <Assessment patient={patient} state={state} busy={busy || syncLost} send={send} />
                )}
                {selected === "Monitor" && (
                  <>
                    <div className="sensor-controls">
                      {(
                        [
                          ["ecg", "ECG leads"],
                          ["spo2", "SpO₂ probe"],
                          ["cuff", "BP cuff"],
                        ] as const
                      ).map(([key, label]) => (
                        <button
                          className="secondary"
                          key={key}
                          aria-pressed={state.sensors[key]}
                          disabled={busy || syncLost}
                          onClick={() =>
                            void send({
                              type: "sensor",
                              sensor: key,
                              connected: !state.sensors[key],
                            })
                          }
                        >
                          {state.sensors[key] ? "Disconnect" : "Connect"}{" "}
                          {label}
                        </button>
                      ))}
                    </div>
                    <button
                      disabled={!state.sensors.cuff || busy || syncLost}
                      onClick={() => void send({ type: "measure_bp" })}
                    >
                      {state.measurements.bp
                        ? "Repeat BP measurement"
                        : "Measure BP"}
                    </button>
                    <p className="muted">
                      A disconnected sensor shows no live value. Last BP remains
                      timestamped until measured again.
                    </p>
                  </>
                )}
                {selected === "Medication" && (
                  <Medication
                    patient={patient}
                    state={state}
                    draft={conversation?.medicationDraft ?? null}
                    busy={busy || syncLost}
                    send={send}
                    clearDraft={clearMedicationDraft}
                  />
                )}
                {selected === "Oxygen / IV" && (
                  <OxygenIv patient={patient} state={state} busy={busy || syncLost} send={send} />
                )}
                {selected === "ECG / results" && (
                  <Investigations patient={patient} state={state} busy={busy || syncLost} send={send} />
                )}
                {selected === "Clipboard" && (
                  <Notes state={state} busy={busy || syncLost} send={send} onDraftChange={(content) => { noteDraft.current = content; }} />
                )}
                {selected === "Call station" && (
                  <CallStation state={state} busy={busy || syncLost} send={send} />
                )}
                {state.lastCommandResult && <p className={`command-status ${state.lastCommandResult.status}`} aria-live="polite">{state.lastCommandResult.message}</p>}
              </section>
            </aside>
          </div>
          {conversation && (
            <Conversation
              key={state.id}
              runId={state.id}
              briefing={patient.voiceBriefing}
              conversation={conversation}
              busy={busy || syncLost}
              sendText={sendText}
              correct={correctTranscript}
              checkpoint={requestReasoningCheckpoint}
              registerFinishFlush={(flush) => { finishTranscript.current = flush; }}
            />
          )}
          <nav className="station-nav" aria-label="Bedside controls">
            {stations.map((station, index) => (
              <button
                key={station}
                aria-pressed={selected === station}
                onClick={() => select(station)}
              >
                <span>0{index + 1}</span>
                {station}
              </button>
            ))}
          </nav>
          </>}
          <footer>
            <span>
              {state.clock.running
                ? "Simulation clock running"
                : "Simulation paused"}
              {" · server revision "}
              {state.revision}
            </span>
            <span>{state.lifecycle === "ended" ? "Run finished · evidence frozen" : `Lifecycle: ${state.lifecycle}`}</span>
            <a className="export-link" href={`/api/runs/${state.id}/export`} download>Export run JSON</a>
          </footer>
        </>
      ) : (
        <p role="status">
          {error
            ? "Unable to load bedside. Reload to retry."
            : "Loading deterministic bedside…"}
        </p>
      )}
    </main>
  );
}
