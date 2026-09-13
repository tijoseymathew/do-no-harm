import { useCallback, useEffect, useRef, useState } from "react";
import {
  StudentCaseSchema,
  type StudentCase,
} from "../../shared/contracts/student.js";
import type {
  FixtureCommand,
  FixtureState,
} from "../../shared/contracts/fixture.js";
import { Room, stations, type Station } from "./Room.js";
import { Monitor } from "./Monitor.js";
import { Medication } from "./Medication.js";
import { Probe } from "./Probe.js";

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
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Server unavailable");
  return result as T;
}
export function App() {
  if (window.location.pathname === "/probe") return <Probe />;
  return <Bedside />;
}
function Bedside() {
  const [patient, setPatient] = useState<StudentCase>();
  const [state, setState] = useState<FixtureState>();
  const [selected, setSelected] = useState<Station>("Patient");
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [muted, setMuted] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const authoritative = useRef<FixtureState>(undefined);
  const locked = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const audio = useRef<AudioContext>(undefined);
  const select = useCallback((station: Station) => {
    setSelected(station);
    requestAnimationFrame(() => heading.current?.focus());
  }, []);
  useEffect(() => {
    let active = true;
    void Promise.all([
      json<unknown>("/api/cases/current").then((value) =>
        StudentCaseSchema.parse(value),
      ),
      json<FixtureState>("/api/fixtures", {}),
    ])
      .then(([p, s]) => {
        if (active) {
          setPatient(p);
          setState(s);
          authoritative.current = s;
        }
      })
      .catch((e) => {
        if (active) setError(String(e));
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    const query = matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setReduced(query.matches);
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, []);
  const send = useCallback(async (command: FixtureCommand) => {
    const s = authoritative.current;
    if (!s || locked.current) return false;
    locked.current = true;
    setBusy(true);
    try {
      const updated = await json<FixtureState>(
        `/api/fixtures/${s.id}/commands`,
        { revision: s.revision, key: crypto.randomUUID(), command },
      );
      authoritative.current = updated;
      setState(updated);
      setError("");
      return true;
    } catch (e) {
      setPaused(true);
      setError(
        `${e instanceof Error ? e.message : "Connection lost"} Fixture paused. Refresh state before continuing.`,
      );
      return false;
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    if (paused || !state) return;
    const timer = setInterval(
      () => void send({ type: "advance", seconds: 1 }),
      1000,
    );
    return () => clearInterval(timer);
  }, [paused, Boolean(state), send]);
  useEffect(() => {
    if (muted || paused || !state?.sensors.ecg) return;
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
    }, 60000 / state.pulseRate);
    return () => clearInterval(timer);
  }, [muted, paused, state?.sensors.ecg, state?.pulseRate]);
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
      const s = await json<FixtureState>(`/api/fixtures/${state.id}`);
      authoritative.current = s;
      setState(s);
      setError("");
    } catch {
      setError(
        "Server unavailable. Fixture remains paused; try Refresh state again.",
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
          <span className="clock" aria-label="Fixture time">
            {Math.floor((state?.simulationTimeMs ?? 0) / 60000)
              .toString()
              .padStart(2, "0")}
            :
            {Math.floor(((state?.simulationTimeMs ?? 0) / 1000) % 60)
              .toString()
              .padStart(2, "0")}
          </span>
          <button
            className="secondary"
            disabled={!state || !!error}
            onClick={() => setPaused(!paused)}
          >
            {paused ? "Resume" : "Pause"}
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
            disabled={!state || busy || !!error}
            onClick={() => void send({ type: "advance", seconds: 30 })}
          >
            Advance fixture +30 s
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
        FIXTURE-BACKED SERVER{" "}
        <span>
          Interaction practice only · physiology is fixture-driven · clinical
          content unreviewed
        </span>
        <a href="/probe">API probe ↗</a>
      </div>
      {error && (
        <div className="error" role="alert">
          {error}{" "}
          {state && (
            <button onClick={() => void refresh()} disabled={busy}>
              Refresh state
            </button>
          )}
        </div>
      )}
      {state && patient ? (
        <>
          <div className="workspace">
            <Room
              selected={selected}
              select={select}
              state={state}
              reduced={reduced}
              paused={paused || !!error}
            />
            <aside>
              <Monitor
                state={state}
                paused={paused || !!error}
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
                  <>
                    <h3>{patient.patient.displayName}</h3>
                    <p>
                      {patient.patient.ageYears} years ·{" "}
                      {patient.patient.weightKg} kg · fictional patient
                    </p>
                    <p>{patient.patient.presentingComplaint}</p>
                    <p>Alert, anxious, pale and clammy.</p>
                    <p className="muted">
                      Focused assessment and conversation are unavailable in
                      this interaction slice.
                    </p>
                    <button onClick={() => select("Monitor")}>
                      Open monitoring
                    </button>
                  </>
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
                          disabled={busy || !!error}
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
                      disabled={!state.sensors.cuff || busy || !!error}
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
                    busy={busy || !!error}
                    send={send}
                  />
                )}
                {selected === "Oxygen / IV" && (
                  <>
                    <h3>Oxygen and IV station</h3>
                    <p>
                      Oxygen tubing: not connected. IV access: not established.
                    </p>
                    <p className="unavailable">
                      Unavailable in Phase 02: oxygen settings, IV access and
                      fluids. Suction is set dressing only.
                    </p>
                  </>
                )}
                {selected === "ECG / results" && (
                  <>
                    <h3>ECG / results workstation</h3>
                    <p className="unavailable">
                      12-lead acquisition, interpretation and blood results are
                      unavailable in Phase 02.
                    </p>
                    <p>
                      The monitor strip is an illustrative rhythm fixture, not a
                      diagnostic 12-lead ECG.
                    </p>
                  </>
                )}
                {selected === "Clipboard" && (
                  <>
                    <h3>Patient chart</h3>
                    <p>
                      {patient.patient.displayName}
                      <br />
                      {patient.patient.allergies.join(", ")}
                      <br />
                      {patient.patient.currentMedications.join(", ")}
                    </p>
                    <p className="unavailable">
                      Note entry and revisions unavailable in Phase 02.
                    </p>
                  </>
                )}
                {selected === "Call station" && (
                  <>
                    <h3>Senior call station</h3>
                    <p className="unavailable">
                      Senior review, handoff and authorization unavailable in
                      Phase 02.
                    </p>
                  </>
                )}
              </section>
            </aside>
          </div>
          <div className="captions" aria-label="Captions">
            <span>PATIENT · AUTHORED TEXT</span>
            <p>“{patient.opening}”</p>
            <small>No live conversation connected</small>
          </div>
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
          <footer>
            <span>
              {paused ? "Fixture paused" : "Fixture clock running"} ·
              Medications do not alter physiology
            </span>
          </footer>
        </>
      ) : (
        <p role="status">
          {error
            ? "Unable to load bedside. Reload to retry."
            : "Loading fixture bedside…"}
        </p>
      )}
    </main>
  );
}
