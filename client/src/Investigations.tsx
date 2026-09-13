import { useState } from "react";
import type { StudentCase } from "../../shared/contracts/student.js";
import type { ScenarioCommand, ScenarioSnapshot } from "../../shared/contracts/scenario.js";
import { EcgArtwork } from "./EcgArtwork.js";

export function Investigations({ patient, state, busy, send }: {
  patient: StudentCase;
  state: ScenarioSnapshot;
  busy: boolean;
  send: (command: ScenarioCommand) => Promise<boolean>;
}) {
  const [interpretation, setInterpretation] = useState("");
  const [unsupported, setUnsupported] = useState("");
  return <div className="investigations-panel">
    <p className="muted">Request, acquisition/collection, availability and display are recorded separately.</p>
    <div className="investigation-list">
      {patient.investigations.map((option) => {
        const item = state.investigations.find(({ id }) => id === option.id)!;
        const remaining = item.availableAtMs === null ? null : Math.max(0, item.availableAtMs - state.clock.simulationTimeMs);
        return <article key={option.id}>
          <header><strong>{option.label}</strong><span className={`state-pill ${item.status}`}>{item.status.replace("_", " ")}</span></header>
          {item.status === "not_requested" && <button disabled={busy} onClick={() => void send({ type: "request_investigation", investigationId: item.id })}>Request</button>}
          {item.status === "requested" && <button disabled={busy} onClick={() => void send({ type: "collect_investigation", investigationId: item.id })}>{option.collectionLabel}</button>}
          {item.status === "pending" && <><p>Pending · available in {Math.ceil((remaining ?? 0) / 1000)} s simulation time.</p><button className="secondary" disabled={busy} onClick={() => void send({ type: "display_investigation", investigationId: item.id, view: item.kind === "ecg" ? "artwork" : "result" })}>Try opening now</button></>}
          {["available", "displayed"].includes(item.status) && <div className="actions">
            <button disabled={busy} onClick={() => void send({ type: "display_investigation", investigationId: item.id, view: item.kind === "ecg" ? "artwork" : "result" })}>{item.kind === "ecg" ? "Open ECG" : "Open result"}</button>
            <button className="secondary" disabled={busy} onClick={() => void send({ type: "display_investigation", investigationId: item.id, view: "report" })}>Open report</button>
          </div>}
          {item.result && <p className="result-value">{item.result}</p>}
          {item.report && <p className="report-copy">{item.report}</p>}
          {item.kind === "ecg" && item.displayedViews.includes("artwork") && <EcgArtwork />}
          {item.status === "displayed" && <form onSubmit={(event) => {
            event.preventDefault();
            if (!interpretation.trim()) return;
            void send({ type: "interpret_investigation", investigationId: item.id, interpretation: interpretation.trim() }).then((accepted) => accepted && setInterpretation(""));
          }}><label>Student interpretation<textarea aria-label={`${option.label} interpretation`} value={interpretation} onChange={(event) => setInterpretation(event.target.value)} /></label><button disabled={busy || !interpretation.trim()}>Save interpretation</button></form>}
          {item.interpretations.at(-1) && <p className="saved-copy"><strong>Saved interpretation:</strong> {item.interpretations.at(-1)!.content}</p>}
        </article>;
      })}
    </div>
    <form className="unsupported-request" onSubmit={(event) => {
      event.preventDefault();
      if (!unsupported.trim()) return;
      void send({ type: "request_case_item", kind: "investigation", name: unsupported.trim() }).then((accepted) => accepted && setUnsupported(""));
    }}><label>Request another investigation<input value={unsupported} onChange={(event) => setUnsupported(event.target.value)} placeholder="Investigation not listed above" /></label><button className="secondary" disabled={busy || !unsupported.trim()}>Check case availability</button></form>
  </div>;
}
