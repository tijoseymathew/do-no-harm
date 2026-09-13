import { useEffect, useRef } from "react";
import type { ScenarioSnapshot } from "../../shared/contracts/scenario.js";

const SWEEP_MS = 4000;

export function beatPeriodMs(hr: number) {
  return 60000 / hr;
}
export function waveform(phase: number, pleth: boolean) {
  if (pleth)
    return phase < 0.45
      ? Math.sin((phase / 0.45) * Math.PI) * 0.75
      : 0.12 * Math.sin(((phase - 0.45) / 0.55) * Math.PI);
  const peak = (center: number, width: number, height: number) =>
    height * Math.exp(-(((phase - center) / width) ** 2));
  return (
    peak(0.16, 0.04, 0.12) -
    peak(0.29, 0.014, 0.18) +
    peak(0.32, 0.012, 1) -
    peak(0.35, 0.017, 0.3) +
    peak(0.59, 0.08, 0.25)
  );
}
function Trace({
  label,
  hr,
  time,
  paused,
  reduced,
  pleth = false,
}: {
  label: string;
  hr: number | null;
  time: number;
  paused: boolean;
  reduced: boolean;
  pleth?: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const node = canvas.current!;
    const context = node.getContext("2d")!;
    const start = performance.now();
    let frame = 0;
    function draw(now: number) {
      const width = node.clientWidth;
      const height = node.clientHeight;
      if (width === 0 || height === 0) {
        frame = requestAnimationFrame(draw);
        return;
      }
      const dpr = Math.min(devicePixelRatio, 2);
      node.width = width * dpr;
      node.height = height * dpr;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, width, height);
      const baseline = height * 0.74;
      context.strokeStyle = "#0f2731";
      context.lineWidth = 0.5;
      for (let x = 0; x < width; x += 20) {
        context.beginPath();
        context.moveTo(x, 0);
        context.lineTo(x, height);
        context.stroke();
      }
      context.beginPath();
      context.moveTo(0, baseline);
      context.lineTo(width, baseline);
      context.stroke();
      if (hr !== null) {
        const end =
          time + (paused || reduced ? 0 : Math.min(now - start, 1000));
        // The sweep window is fixed to the wall of the screen: the cursor walks
        // left to right and the trace behind it is the four seconds just drawn.
        const windowStart = Math.floor(end / SWEEP_MS) * SWEEP_MS;
        const cursor = ((end - windowStart) / SWEEP_MS) * width;
        const stroke = pleth ? "#45d6f0" : "#3ef08a";
        const period = beatPeriodMs(hr);
        context.strokeStyle = stroke;
        context.shadowColor = stroke;
        context.shadowBlur = 5;
        context.lineWidth = 1.7;
        context.lineJoin = "round";
        context.beginPath();
        let open = false;
        for (let x = 0; x <= width; x++) {
          // Blank the segment immediately ahead of the cursor, the way a
          // monitor erases the previous sweep just before redrawing it.
          if (x > cursor && x < cursor + 16) {
            open = false;
            continue;
          }
          const sample = windowStart + (x / width) * SWEEP_MS;
          const phase = (((sample % period) + period) % period) / period;
          const y = baseline - waveform(phase, pleth) * (height * 0.62);
          if (!open) {
            context.moveTo(x, y);
            open = true;
          } else context.lineTo(x, y);
        }
        context.stroke();
        context.shadowBlur = 0;
        // Drawn even when frozen: without it the erase gap reads as a fault in
        // the trace rather than the position of the sweep.
        context.fillStyle = stroke;
        context.fillRect(cursor, 0, 1.5, height);
      }
      if (!paused && !reduced) frame = requestAnimationFrame(draw);
    }
    draw(start);
    return () => cancelAnimationFrame(frame);
  }, [hr, time, paused, reduced, pleth]);
  return (
    <canvas
      ref={canvas}
      className="channel-trace"
      aria-label={`${label}: ${hr === null ? "not connected" : `${hr} beats/min, four-second strip`}`}
    />
  );
}
export function Monitor({
  state,
  paused,
  reduced,
}: {
  state: ScenarioSnapshot;
  paused: boolean;
  reduced: boolean;
}) {
  const m = state.measurements;
  const plethRate = state.sensors.spo2 ? state.physiology.heartRate : null;
  return (
    <section className="monitor" aria-label="Bedside monitor summary">
      <div className="monitor-bar">
        <h2>Bedside monitor</h2>
        <span className="monitor-alarms">ALARMS OFF</span>
        <span className="tag">ENGINE</span>
      </div>
      <div className="monitor-screen">
        <div className="channel" data-channel="ecg">
          <div className="channel-lead">
            <b>ECG</b>
            <span>II · 4 s</span>
          </div>
          <Trace
            label="ECG"
            hr={m.hr}
            time={state.simulationTimeMs}
            paused={paused}
            reduced={reduced}
          />
          <div className="channel-value">
            <span>HR · beats/min</span>
            <strong>{m.hr ?? "—"}</strong>
            <small>
              {state.sensors.ecg ? "Leads connected" : "Not connected"}
            </small>
          </div>
        </div>
        <div className="channel" data-channel="pleth">
          <div className="channel-lead">
            <b>Pleth</b>
            <span>SpO₂ · 4 s</span>
          </div>
          <Trace
            label="Pleth"
            hr={plethRate}
            time={state.simulationTimeMs}
            paused={paused}
            reduced={reduced}
            pleth
          />
          <div className="channel-value">
            <span>SpO₂ · %</span>
            <strong>{m.spo2 ?? "—"}</strong>
            <small>
              {state.sensors.spo2 ? "Probe connected" : "Not connected"}
            </small>
          </div>
        </div>
        <div className="monitor-tiles">
          <div className="tile" data-channel="resp">
            <span>RR · breaths/min</span>
            <strong>{m.rr}</strong>
            <small>Engine observation · no resp sensor</small>
          </div>
          <div className="tile" data-channel="nibp">
            <span>NIBP · mmHg</span>
            <strong>{m.bp?.value ?? "—"}</strong>
            <small>
              {m.bp
                ? `${Math.floor((state.simulationTimeMs - m.bp.measuredAtMs) / 1000)} s ago`
                : "Apply cuff to measure"}
            </small>
            <small>
              {state.sensors.cuff ? "Cuff connected" : "Cuff not connected"}
              {m.bp && !state.sensors.cuff ? " · last reading retained" : ""}
            </small>
          </div>
        </div>
      </div>
      <p className="monitor-note">
        {state.branch.kind === "delayed_care"
          ? "⚠ Authored deterioration active · development fixture"
          : "ⓘ Server physiology · clinical rules unreviewed"}
      </p>
    </section>
  );
}
