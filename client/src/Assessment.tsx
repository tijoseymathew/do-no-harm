import type { StudentCase } from "../../shared/contracts/student.js";
import type { ScenarioCommand, ScenarioSnapshot } from "../../shared/contracts/scenario.js";

export function Assessment({ patient, state, busy, send }: {
  patient: StudentCase;
  state: ScenarioSnapshot;
  busy: boolean;
  send: (command: ScenarioCommand) => Promise<boolean>;
}) {
  return <div className="assessment-panel">
    <h3>{patient.patient.displayName}</h3>
    <p>{patient.patient.ageYears} years · {patient.patient.weightKg} kg · fictional patient<br />
      {state.physiology.presentation}.</p>
    {(["history", "assessment"] as const).map((kind) => <section className="control-group" key={kind}>
      <h3>{kind === "history" ? "Focused history" : "Examination"}</h3>
      <div className="action-grid">
        {patient.assessmentOptions.filter((option) => option.kind === kind).map((option) => {
          const finding = state.assessments.find(({ id }) => id === option.id);
          return <button className="secondary" key={option.id} disabled={busy}
            onClick={() => void send({ type: "perform_assessment", findingId: option.id })}>
            {finding ? "Reassess" : kind === "history" ? "Ask" : "Perform"} · {option.label}
          </button>;
        })}
      </div>
    </section>)}
    <div className="finding-list" aria-live="polite">
      {state.assessments.length === 0 ? <p className="muted">Findings appear only after the matching question or examination.</p> :
        state.assessments.map((finding) => <article key={finding.id}>
          <strong>{finding.label}</strong><span>{finding.value}{finding.unit ? ` ${finding.unit}` : ""}</span>
          <small>{finding.count > 1 ? `Reassessed ${finding.count} times` : "Assessed once"} · {(finding.lastPerformedAtMs / 1000).toFixed(0)} s</small>
        </article>)}
    </div>
  </div>;
}
