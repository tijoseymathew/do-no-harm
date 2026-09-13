import { useState } from "react";
import type { ScenarioCommand, ScenarioSnapshot } from "../../shared/contracts/scenario.js";

export function CallStation({ state, busy, send }: {
  state: ScenarioSnapshot;
  busy: boolean;
  send: (command: ScenarioCommand) => Promise<boolean>;
}) {
  const [handoff, setHandoff] = useState("");
  return <div className="call-panel">
    <h3>Senior review</h3>
    <p>Request: <strong>{state.senior.requestedAtMs === null ? "not requested" : "sent"}</strong> · Acknowledgment: <strong>{state.senior.acknowledgedAtMs === null ? "pending" : "received"}</strong></p>
    {state.senior.requestedAtMs === null && <button disabled={busy} onClick={() => void send({ type: "request_senior" })}>Request senior review</button>}
    <h3>Structured text handoff</h3>
    <form onSubmit={(event) => {
      event.preventDefault();
      if (!handoff.trim()) return;
      void send({ type: "record_handoff", content: handoff.trim() }).then((accepted) => accepted && setHandoff(""));
    }}><label>Handoff content<textarea aria-label="Handoff content" rows={6} value={handoff} onChange={(event) => setHandoff(event.target.value)} placeholder="Situation · Background · Assessment · Recommendation" /></label>
      <button disabled={busy || !handoff.trim()}>Give handoff</button></form>
    {state.handoffs.at(-1) && <p className="saved-copy"><strong>Handoff recorded separately from the request:</strong><br />{state.handoffs.at(-1)!.content}</p>}
  </div>;
}
