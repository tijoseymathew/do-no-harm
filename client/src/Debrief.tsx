import { useMemo, useState } from "react";
import type { ConversationSnapshot } from "../../shared/contracts/conversation.js";
import type { DebriefSnapshot, EvidenceCard } from "../../shared/contracts/debrief.js";

const criterionLabels: Record<string, string> = {
  assessment: "Assessment",
  interpretation: "Interpretation",
  intervention_selection_dosing: "Intervention selection / dosing",
  reassessment: "Reassessment",
  escalation: "Escalation",
  communication_documentation: "Communication / documentation",
};

export function Debrief({
  debrief,
  conversation,
  busy,
  retry,
  teachBack,
  answerTeachBack,
  correctTranscript,
}: {
  debrief: DebriefSnapshot;
  conversation?: ConversationSnapshot;
  busy: boolean;
  retry: () => Promise<void>;
  teachBack: () => Promise<void>;
  answerTeachBack: (text: string) => Promise<void>;
  correctTranscript: (messageId: string, text: string) => Promise<void>;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [correction, setCorrection] = useState("");
  const selected = debrief.evidence.find(({ id }) => id === selectedId) ?? null;
  const active = debrief.feedbackRevisions.find(({ revision }) => revision === debrief.activeFeedbackRevision);
  const transcriptMessage = selected?.kind === "transcript_segment"
    ? conversation?.messages.find(({ eventId }) => eventId === selected.id)
    : undefined;
  const cited = (ids: string[]) => (
    <span className="citation-links">
      {ids.map((id) => {
        const evidence = debrief.evidence.find((item) => item.id === id);
        return <button key={id} className="citation" onClick={() => setSelectedId(id)}>#{evidence?.sequence ?? "?"} {evidence?.title ?? "Evidence"}</button>;
      })}
    </span>
  );

  function speak() {
    if (!active || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const text = `Formative debrief. Strength: ${active.output.strength}. Priority improvement: ${active.output.priorityImprovement}. Next practice objective: ${active.output.nextPracticeObjective}`;
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
  }

  return (
    <section className="debrief" aria-label="Visual formative debrief">
      <header className="debrief-header">
        <div>
          <p className="eyebrow">FORMATIVE PRACTICE · EVIDENCE REPLAY</p>
          <h2>Run debrief</h2>
          <p>Cutoff <strong>{debrief.cutoffName}</strong> · event #{debrief.evidenceCutoffSequence} · transcript {debrief.transcriptDrain.status.replace("_", " ")}</p>
        </div>
        <div className="debrief-controls">
          <a className="export-link" href={`/api/runs/${debrief.runId}/export`} download>Download debrief evidence</a>
          <button className="secondary" disabled={busy || !active} onClick={speak}>Play spoken debrief</button>
          <button className="secondary" disabled={busy || debrief.status === "evaluating"} onClick={() => void retry()}>{debrief.status === "unavailable" ? "Retry evaluation" : "Check for late corrections"}</button>
        </div>
      </header>

      <div className="cutoff-notice">Evidence is fixed at the named cutoff for each feedback revision. Prepared and blocked orders are never shown as administered doses.</div>
      {debrief.status === "unavailable" && <div className="evaluation-unavailable" role="alert"><strong>Evaluation unavailable.</strong> {debrief.evaluationMessage} The run and evidence remain intact.</div>}

      <VitalTrend debrief={debrief} selectEvidence={setSelectedId} />

      <div className="debrief-grid">
        <section className="feedback-panel">
          <div className="section-heading"><h3>Six criterion outcomes</h3><span>{active?.label ?? "Awaiting evaluation"}</span></div>
          {active ? (
            <>
              <div className="summary-grid">
                <article className="strength"><span>Strength</span><p>{active.output.strength}</p>{cited(active.output.strengthEvidenceIds ?? [])}</article>
                <article className="improvement"><span>Priority improvement</span><p>{active.output.priorityImprovement}</p>{cited(active.output.priorityImprovementEvidenceIds ?? [])}</article>
                <article><span>Next-practice objective</span><p>{active.output.nextPracticeObjective}</p></article>
              </div>
              <ol className="criteria-list">
                {active.output.criteria.map((item) => <li key={item.criterion}>
                  <div><strong>{criterionLabels[item.criterion]}</strong><span className={`rating ${item.rating}`}>{item.rating.replace("_", " ")}</span></div>
                  <p>{item.reason}</p>
                  {item.evidenceIds.length ? cited(item.evidenceIds) : <small>No supporting event was available at this cutoff.</small>}
                </li>)}
              </ol>
            </>
          ) : <p role="status">{debrief.evaluationMessage}</p>}
          {debrief.feedbackRevisions.length > 1 && <details className="revision-history"><summary>{debrief.feedbackRevisions.length} preserved feedback revisions</summary><ol>{debrief.feedbackRevisions.map((revision) => <li key={revision.revision}>{revision.label} · cutoff {revision.cutoffName} / #{revision.evidenceCutoffSequence}</li>)}</ol></details>}
        </section>

        <section className="action-panel">
          <div className="section-heading"><h3>Chronological actions</h3><span>{debrief.actions.length} events</span></div>
          <ol className="action-list">
            {debrief.actions.map((action) => <li key={action.eventId}>
              <button onClick={() => setSelectedId(action.eventId)}>
                <time>{formatTime(action.simulationTimeMs)}</time>
                <span className={`action-status ${action.status}`}>{action.status}</span>
                <strong>{action.label}</strong>
              </button>
            </li>)}
          </ol>
        </section>
      </div>

      <section className="evidence-browser">
        <div className="section-heading"><h3>Evidence cards</h3><span>Open an exact source event</span></div>
        <div className="evidence-layout">
          <div className="evidence-card-list">
            {debrief.evidence.map((item) => <button key={item.id} aria-pressed={item.id === selectedId} onClick={() => setSelectedId(item.id)}>
              <span>{item.kind.replaceAll("_", " ")} · #{item.sequence} · {formatTime(item.simulationTimeMs)}</span>
              <strong>{item.title}</strong>
              <small>{item.summary}</small>
              {(item.superseded || item.assisted) && <i>{item.superseded ? "superseded" : ""}{item.superseded && item.assisted ? " · " : ""}{item.assisted ? "assisted" : ""}</i>}
            </button>)}
          </div>
          <EvidenceDetail evidence={selected} />
        </div>
        {transcriptMessage && !transcriptMessage.supersededByMessageId && <form className="late-correction" onSubmit={(event) => {
          event.preventDefault();
          if (!correction.trim()) return;
          void correctTranscript(transcriptMessage.id, correction.trim()).then(() => setCorrection(""));
        }}><label>Late transcript correction<textarea value={correction} onChange={(event) => setCorrection(event.target.value)} placeholder={transcriptMessage.text} /></label><button disabled={busy || !correction.trim()}>Save correction</button><small>Saving appends evidence. Use “Check for late corrections” to create a labeled feedback revision.</small></form>}
      </section>

      {active && <section className="teach-back">
        <div><h3>Optional teach-back</h3><p>This prompt and the next answer are explicitly marked assisted evidence.</p></div>
        {!debrief.teachBack ? <button disabled={busy} onClick={() => void teachBack()}>Start assisted teach-back</button> : <form onSubmit={(event) => {
          event.preventDefault();
          const value = answer.trim();
          if (!value) return;
          setAnswer("");
          void answerTeachBack(value);
        }}><p><strong>Examiner:</strong> {debrief.teachBack.question}</p><label>Teach-back answer<input value={answer} onChange={(event) => setAnswer(event.target.value)} /></label><button disabled={busy || !answer.trim()}>Submit assisted answer</button></form>}
      </section>}
    </section>
  );
}

function VitalTrend({ debrief, selectEvidence }: { debrief: DebriefSnapshot; selectEvidence: (id: string) => void }) {
  const maxTime = Math.max(1, ...debrief.trend.map(({ simulationTimeMs }) => simulationTimeMs), ...debrief.markers.map(({ simulationTimeMs }) => simulationTimeMs));
  const lanes = [
    { key: "heartRate", label: "HR", unit: "bpm", color: "#3ef08a" },
    { key: "spo2", label: "SpO₂", unit: "%", color: "#45d6f0" },
    { key: "respiratoryRate", label: "RR", unit: "/min", color: "#f0d64a" },
    { key: "systolicBp", label: "SBP", unit: "mmHg", color: "#e6eef1" },
  ] as const;
  const paths = useMemo(() => lanes.map((lane, index) => {
    const values = debrief.trend.map((point) => point[lane.key]);
    const min = Math.min(...values) - 1;
    const max = Math.max(...values) + 1;
    const yTop = 18 + index * 52;
    const path = debrief.trend.map((point, pointIndex) => {
      const x = 76 + (point.simulationTimeMs / maxTime) * 814;
      const y = yTop + 32 - ((point[lane.key] - min) / (max - min)) * 28;
      return `${pointIndex ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
    return { ...lane, yTop, path, first: values[0], last: values.at(-1) };
  }), [debrief.trend, maxTime]);
  return <section className="trend-panel">
    <div className="section-heading"><h3>Vital-sign trend and event markers</h3><span>Authored simulation response · not patient-specific prediction</span></div>
    <svg viewBox="0 0 920 250" role="img" aria-label="Heart rate, oxygen saturation, respiratory rate, and systolic blood pressure trends with assessment, treatment, alarm, and escalation markers">
      {paths.map((lane) => <g key={lane.key}>
        <text x="8" y={lane.yTop + 20} fill={lane.color}>{lane.label}</text>
        <text x="8" y={lane.yTop + 34} className="chart-unit">{lane.unit}</text>
        <line x1="76" x2="890" y1={lane.yTop + 34} y2={lane.yTop + 34} className="chart-grid" />
        <path d={lane.path} fill="none" stroke={lane.color} strokeWidth="2.5" />
        <text x="896" y={lane.yTop + 23} fill={lane.color}>{lane.last}</text>
      </g>)}
      {debrief.markers.map((marker, index) => {
        const x = 76 + (marker.simulationTimeMs / maxTime) * 814;
        return <g key={`${marker.eventId}-${index}`} className={`chart-marker ${marker.kind}`} onClick={() => selectEvidence(marker.eventId)} role="button" tabIndex={0}>
          <line x1={x} x2={x} y1="8" y2="226" />
          <circle cx={x} cy={8 + (index % 3) * 7} r="4" />
          <title>{formatTime(marker.simulationTimeMs)} · {marker.label}</title>
        </g>;
      })}
      <text x="76" y="244" className="chart-axis">00:00</text><text x="850" y="244" className="chart-axis">{formatTime(maxTime)}</text>
    </svg>
    <div className="marker-key"><span className="assessment">Assessment</span><span className="treatment">Administered / device change</span><span className="alarm">Alarm / deterioration</span><span className="escalation">Escalation</span></div>
  </section>;
}

function EvidenceDetail({ evidence }: { evidence: EvidenceCard | null }) {
  if (!evidence) return <article className="evidence-detail empty"><p>Select a citation, action, marker, or evidence card to open its exact recorded source.</p></article>;
  return <article className="evidence-detail" aria-live="polite">
    <span>{evidence.kind.replaceAll("_", " ")} · event #{evidence.sequence}</span>
    <h4>{evidence.title}</h4>
    <p>{evidence.summary}</p>
    <pre>{evidence.detail}</pre>
  </article>;
}

function formatTime(milliseconds: number) {
  const seconds = Math.floor(milliseconds / 1000);
  return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}
