import { useState } from "react";
import type { StudentCase } from "../../shared/contracts/student.js";
import {
  ReviewableMedicationOrderSchema,
  type ReviewableMedicationOrder,
  type ScenarioCommand,
  type ScenarioSnapshot,
} from "../../shared/contracts/scenario.js";

export function Medication({
  patient,
  state,
  busy,
  send,
}: {
  patient: StudentCase;
  state: ScenarioSnapshot;
  busy: boolean;
  send: (command: ScenarioCommand) => Promise<boolean>;
}) {
  const [dose, setDose] = useState("");
  const [route, setRoute] = useState("");
  const [unit, setUnit] = useState("");
  const [review, setReview] = useState<ReviewableMedicationOrder>();
  const [error, setError] = useState("");
  const drug = patient.formulary[0]!;
  async function prepare(event: React.SubmitEvent) {
    event.preventDefault();
    const parsed = ReviewableMedicationOrderSchema.safeParse({
      drugId: drug.id,
      dose: dose.trim() ? Number(dose) : 0,
      unit,
      route,
    });
    if (!parsed.success) {
      setError("Enter a positive dose and select its unit and route.");
      return;
    }
    const checksRecorded = await send({
      type: "confirm_medication_checks",
      allergyHistoryReviewed: true,
      administrationHistoryReviewed: true,
    });
    if (!checksRecorded) return;
    setError("");
    setReview(parsed.data);
  }
  const last = state.receipts.at(-1);
  return (
    <div>
      <p className="patient-check">
        {patient.patient.displayName} · {patient.patient.ageYears} years ·{" "}
        {patient.patient.weightKg} kg
        <br />
        {patient.patient.allergies.join(", ")}
        <br />
        <span className="muted">
          Current: {patient.patient.currentMedications.join(", ")}
          <br />
          Prior administrations: {last ? "1 (see receipt)" : "none"}.
        </span>
      </p>
      {last ? (
        <div className="receipt" role="status">
          <h3>Administration accepted</h3>
          <p>
            <strong>
              Aspirin · {last.dose} {last.unit} · {last.route}
            </strong>
            <br />
            Student · {(last.simulationTimeMs / 1000).toFixed(0)} s ·{" "}
            {last.status}
            <br />
            Cumulative normalized dose: {last.cumulativeQuantity}{" "}
            {last.normalizedUnit}. Trolley updated.
          </p>
          <small>Receipt {last.id}</small>
          <p>
            Server-validated development receipt. Clinical rules remain
            unreviewed.
          </p>
        </div>
      ) : (
        <>
          {!review ? (
            <form onSubmit={prepare}>
              <label>
                Drug / formulation
                <select
                  aria-label="Drug / formulation"
                  value={drug.id}
                  onChange={() => {}}
                >
                  <option value={drug.id}>
                    {drug.name} — {drug.formulation}
                  </option>
                </select>
              </label>
              <div className="order-fields">
                <label>
                  Dose
                  <input
                    required
                    type="number"
                    min="0.01"
                    max="10000"
                    step="any"
                    value={dose}
                    onChange={(e) => setDose(e.target.value)}
                  />
                </label>
                <label>
                  Unit
                  <select
                    aria-label="Unit"
                    required
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                  >
                    <option value="">Select</option>
                    {drug.allowedUnits.map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Route
                  <select
                    aria-label="Route"
                    required
                    value={route}
                    onChange={(e) => setRoute(e.target.value)}
                  >
                    <option value="">Select</option>
                    {drug.allowedRoutes.map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </label>
              </div>
              <button disabled={busy} type="submit">
                Review medication
              </button>
            </form>
          ) : (
            <div className="review-order">
              <h3>Review administration</h3>
              <p>
                <strong>
                  {drug.name} · {review.dose} {review.unit} · {review.route}
                </strong>
                <br />
                {drug.formulation} · give now
              </p>
              <p>
                Confirm identity, allergies, contraindications and prior doses.
                The server validates dose, units, route, cumulative exposure,
                repeat timing, access, and authorization against the case rule.
              </p>
              <div className="actions">
                <button
                  disabled={busy}
                  onClick={async () => {
                    if (await send({ type: "administer", order: review }))
                      setReview(undefined);
                  }}
                >
                  Administer
                </button>
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => setReview(undefined)}
                >
                  Cancel review
                </button>
              </div>
            </div>
          )}
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
