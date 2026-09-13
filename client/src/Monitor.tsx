import { useEffect, useRef } from "react";
import type { ScenarioSnapshot } from "../../shared/contracts/scenario.js";

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
      const height = 52;
      const dpr = Math.min(devicePixelRatio, 2);
      node.width = width * dpr;
      node.height = height * dpr;
      context.scale(dpr, dpr);
      context.clearRect(0, 0, width, height);
      context.strokeStyle = "#19343e";
      context.lineWidth = 0.5;
      for (let x = 0; x < width; x += 20) {
        context.beginPath();
        context.moveTo(x, 0);
        context.lineTo(x, height);
        context.stroke();
      }
      if (hr !== null) {
        const end =
          time + (paused || reduced ? 0 : Math.min(now - start, 1000));
        context.strokeStyle = pleth ? "#77d6ed" : "#83e6ad";
        context.lineWidth = 1.7;
        context.beginPath();
        for (let x = 0; x <= width; x++) {
          const sample = end - ((width - x) / width) * 4000;
          const phase =
            (((sample % beatPeriodMs(hr)) + beatPeriodMs(hr)) %
              beatPeriodMs(hr)) /
            beatPeriodMs(hr);
          const y = 37 - waveform(phase, pleth) * 28;
          if (x === 0) context.moveTo(x, y);
          else context.lineTo(x, y);
        }
        context.stroke();
      }
      if (!paused && !reduced) frame = requestAnimationFrame(draw);
    }
    draw(start);
    return () => cancelAnimationFrame(frame);
  }, [hr, time, paused, reduced, pleth]);
  return (
    <div className={pleth ? "trace pleth" : "trace"}>
      <div>
        {label}{" "}
        <span>
          {hr === null ? "Not connected" : "4-second strip · engine"}
        </span>
      </div>
      <canvas
        ref={canvas}
        aria-label={`${label}: ${hr === null ? "not connected" : `${hr} beats/min, four-second strip`}`}
      />
    </div>
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
  return (
    <section className="monitor" aria-label="Bedside monitor summary">
      <div className="panel-heading">
        <h2>Bedside monitor</h2>
        <span className="tag">ENGINE</span>
      </div>
      <Trace
        label="ECG"
        hr={m.hr}
        time={state.simulationTimeMs}
        paused={paused}
        reduced={reduced}
      />
      <Trace
        label="Pleth"
        hr={state.sensors.spo2 ? state.physiology.heartRate : null}
        time={state.simulationTimeMs}
        paused={paused}
        reduced={reduced}
        pleth
      />
      <div className="measurements">
        <div className="ecg-number">
          <span>HR · beats/min</span>
          <strong>{m.hr ?? "—"}</strong>
          <small>
            {state.sensors.ecg ? "Leads connected" : "Not connected"}
          </small>
        </div>
        <div className="spo2-number">
          <span>SpO₂ · %</span>
          <strong>{m.spo2 ?? "—"}</strong>
          <small>
            {state.sensors.spo2 ? "Probe connected" : "Not connected"}
          </small>
        </div>
        <div>
          <span>RR · breaths/min</span>
          <strong>{m.rr}</strong>
          <small>Engine observation</small>
        </div>
      </div>
      <div className="bp">
        <span>
          BP · mmHg <strong>{m.bp?.value ?? "Not measured"}</strong>
        </span>
        <span>
          {m.bp
            ? `${Math.floor((state.simulationTimeMs - m.bp.measuredAtMs) / 1000)} s ago`
            : "Apply cuff to measure"}
          <small>
            {state.sensors.cuff ? "Cuff connected" : "Cuff not connected"}
            {m.bp && !state.sensors.cuff ? " · last reading retained" : ""}
          </small>
        </span>
      </div>
      <p className="monitor-note">
        {state.branch.kind === "delayed_care"
          ? "⚠ Authored deterioration active · development fixture"
          : "ⓘ Server physiology · clinical rules unreviewed"}
      </p>
    </section>
  );
}
