import { useState } from "react";
import type { StudentCase } from "../../shared/contracts/student.js";
import {
  OrderSchema,
  type FixtureCommand,
  type FixtureState,
  type Order,
} from "../../shared/contracts/fixture.js";

export function Medication({
  patient,
  state,
  busy,
  send,
}: {
  patient: StudentCase;
  state: FixtureState;
  busy: boolean;
  send: (command: FixtureCommand) => Promise<boolean>;
}) {
  const [dose, setDose] = useState("");
  const [route, setRoute] = useState("");
  const [unit, setUnit] = useState("");
  const [review, setReview] = useState<Order>();
  const [error, setError] = useState("");
  const drug = patient.formulary[0]!;
  function prepare(event: React.SubmitEvent) {
    event.preventDefault();
    const parsed = OrderSchema.safeParse({
      drugId: drug.id,
      dose: dose.trim() ? Number(dose) : 0,
      unit,
      route,
    });
    if (!parsed.success) {
      setError("Enter a positive dose and select its unit and route.");
      return;
    }
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
            Cumulative fixture dose: {last.dose} {last.unit}. Trolley updated.
          </p>
          <small>Receipt {last.id}</small>
          <p>
            Fixture receipt only. No clinical eligibility check or physiological
            effect.
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
                Fixture validates format only; clinical eligibility and
                authorization unavailable.
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
