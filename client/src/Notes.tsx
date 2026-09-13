import { useEffect, useState } from "react";
import type { ScenarioCommand, ScenarioSnapshot } from "../../shared/contracts/scenario.js";

export function Notes({ state, busy, send, onDraftChange }: {
  state: ScenarioSnapshot;
  busy: boolean;
  send: (command: ScenarioCommand) => Promise<boolean>;
  onDraftChange?: (content: string) => void;
}) {
  const latest = state.notes.at(-1);
  const [content, setContent] = useState(latest?.content ?? "");
  useEffect(() => { if (latest) setContent(latest.content); }, [latest?.revision]);
  useEffect(() => { onDraftChange?.(content); }, [content, onDraftChange]);
  return <div className="notes-panel">
    <h3>Assessment, rationale and plan</h3>
    <form onSubmit={(event) => { event.preventDefault(); if (content.trim()) void send({ type: "save_note", content: content.trim() }); }}>
      <label>Clinical note<textarea aria-label="Clinical note" rows={7} value={content} onChange={(event) => setContent(event.target.value)} placeholder="Assessment, working diagnosis, rationale and plan…" /></label>
      <button disabled={busy || !content.trim()}>{latest ? "Save revised note" : "Save note"}</button>
    </form>
    {state.notes.length > 0 && <details className="status-history"><summary>{state.notes.length} saved note revision{state.notes.length === 1 ? "" : "s"}</summary><ol>
      {state.notes.map((note) => <li key={note.eventId}><strong>Revision {note.revision}</strong> · {(note.savedAtMs / 1000).toFixed(0)} s<br />{note.content}</li>)}
    </ol></details>}
  </div>;
}
