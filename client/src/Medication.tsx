import { useEffect, useState } from "react";
import type { VoiceMedicationDraft } from "../../shared/contracts/conversation.js";
import type { StudentCase } from "../../shared/contracts/student.js";
import {
  ReviewableMedicationOrderSchema,
  type ScenarioCommand,
  type ScenarioSnapshot,
} from "../../shared/contracts/scenario.js";

export function Medication({ patient, state, draft, busy, send, clearDraft }: {
  patient: StudentCase;
  state: ScenarioSnapshot;
  draft: VoiceMedicationDraft | null;
  busy: boolean;
  send: (command: ScenarioCommand) => Promise<boolean>;
  clearDraft: () => Promise<void>;
}) {
  const [dose, setDose] = useState("");
  const [route, setRoute] = useState("");
  const [unit, setUnit] = useState("");
  const [allergiesChecked, setAllergiesChecked] = useState(false);
  const [historyChecked, setHistoryChecked] = useState(false);
  const [unsupported, setUnsupported] = useState("");
  const [localError, setLocalError] = useState("");
  const drug = patient.formulary[0]!;
  const active = state.treatments.preparedOrders.find(({ status }) => status === "prepared");
  const activeIsComplete = Boolean(
    active && active.order.dose !== null && active.order.unit && active.order.route,
  );
  const last = state.receipts.at(-1);

  useEffect(() => {
    if (!draft) return;
    setDose(draft.dose?.toString() ?? "");
    setUnit(draft.unit ?? "");
    setRoute(draft.route ?? "");
    setAllergiesChecked(false);
    setHistoryChecked(false);
  }, [draft]);

  async function prepare(event: React.SubmitEvent) {
    event.preventDefault();
    const parsed = ReviewableMedicationOrderSchema.safeParse({
      drugId: drug.id,
      dose: dose.trim() ? Number(dose) : 0,
      unit,
      route,
    });
    if (!parsed.success || !allergiesChecked || !historyChecked) {
      setLocalError("Enter a positive dose, select unit and route, and complete both checks.");
      return;
    }
    if (!(await send({
      type: "confirm_medication_checks",
      allergyHistoryReviewed: true,
      administrationHistoryReviewed: true,
    }))) return;
    const prepared = await send(
      active
        ? {
            type: "update_prepared_medication",
            preparedOrderId: active.id,
            order: parsed.data,
          }
        : { type: "prepare_medication", order: parsed.data },
    );
    if (prepared) {
      setLocalError("");
      if (draft) await clearDraft();
    }
  }

  return (
    <div className="medication-panel">
      <p className="patient-check">
        {patient.patient.displayName} · {patient.patient.ageYears} years · {patient.patient.weightKg} kg
        <br />Allergies: {patient.patient.allergies.join(", ")}
        <br /><span className="muted">
          Current: {patient.patient.currentMedications.join(", ")}<br />
          Administrations: {state.receipts.length || "none"}
        </span>
      </p>

      {last && (
        <div className="receipt" role="status">
          <h3>Administration accepted</h3>
          <p><strong>{drug.name} · {last.dose} {last.unit} · {last.route}</strong><br />
            Student · {(last.simulationTimeMs / 1000).toFixed(0)} s · {last.status}<br />
            Cumulative: {last.cumulativeQuantity} {last.normalizedUnit}</p>
          <small>Receipt {last.id}</small>
        </div>
      )}

      {active && activeIsComplete ? (
        <div className="review-order">
          <h3>Prepared — not administered</h3>
          <p><strong>{drug.name} · {active.order.dose} {active.order.unit} · {active.order.route}</strong><br />
            {drug.formulation} · give now</p>
          <p>Final administration validates dose, route, prerequisites, cumulative exposure, repeat timing, access and authorization.</p>
          <div className="actions">
            <button disabled={busy} onClick={() => void send({ type: "administer_prepared", preparedOrderId: active.id })}>
              Administer
            </button>
            <button className="secondary" disabled={busy} onClick={() => void send({ type: "cancel_medication", preparedOrderId: active.id })}>
              Cancel prepared order
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={prepare}>
          {draft && <p className="draft-origin">{draft.source === "voice" ? "Voice" : "Text"}-created draft · visible review only · not administered</p>}
          <label>Drug / formulation
            <select aria-label="Drug / formulation" value={drug.id} onChange={() => undefined}>
              <option value={drug.id}>{drug.name} — {drug.formulation}</option>
            </select>
          </label>
          <div className="order-fields">
            <label>{draft ? "Draft dose" : "Dose"}<input aria-label={draft ? "Draft dose" : "Dose"} required type="number" min="0.01" max="10000" step="any" value={dose} onChange={(event) => setDose(event.target.value)} /></label>
            <label>{draft ? "Draft unit" : "Unit"}<select aria-label={draft ? "Draft unit" : "Unit"} required value={unit} onChange={(event) => setUnit(event.target.value)}>
              <option value="">Select</option>{drug.allowedUnits.map((value) => <option key={value}>{value}</option>)}
            </select></label>
            <label>{draft ? "Draft route" : "Route"}<select aria-label={draft ? "Draft route" : "Route"} required value={route} onChange={(event) => setRoute(event.target.value)}>
              <option value="">Select</option>{drug.allowedRoutes.map((value) => <option key={value}>{value}</option>)}
            </select></label>
          </div>
          <div className="check-grid">
            <label><input type="checkbox" checked={allergiesChecked} onChange={(event) => setAllergiesChecked(event.target.checked)} /> Allergy history reviewed</label>
            <label><input type="checkbox" checked={historyChecked} onChange={(event) => setHistoryChecked(event.target.checked)} /> Prior doses reviewed</label>
          </div>
          <button disabled={busy} type="submit">{draft ? "Confirm draft parameters" : "Review and prepare medication"}</button>
          {draft && <button disabled className="secondary" type="button">Administer</button>}
        </form>
      )}

      {state.treatments.preparedOrders.length > 0 && (
        <details className="status-history"><summary>Treatment status history</summary><ol>
          {state.treatments.preparedOrders.map((order) => <li key={order.id}>
            {order.order.dose} {order.order.unit} {order.order.route} — <strong>{order.status}</strong>. {order.message}
          </li>)}
        </ol></details>
      )}

      <form className="unsupported-request" onSubmit={(event) => {
        event.preventDefault();
        if (!unsupported.trim()) return;
        void send({ type: "request_case_item", kind: "medication", name: unsupported.trim() })
          .then((accepted) => accepted && setUnsupported(""));
      }}>
        <label>Ask for another drug<input value={unsupported} onChange={(event) => setUnsupported(event.target.value)} placeholder="Drug not listed above" /></label>
        <button className="secondary" disabled={busy || !unsupported.trim()}>Check case availability</button>
      </form>
      {localError && <p role="alert">{localError}</p>}
    </div>
  );
}
