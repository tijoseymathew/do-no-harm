import { useState } from "react";
import type { StudentCase } from "../../shared/contracts/student.js";
import type { ScenarioCommand, ScenarioSnapshot } from "../../shared/contracts/scenario.js";

export function OxygenIv({ patient, state, busy, send }: {
  patient: StudentCase;
  state: ScenarioSnapshot;
  busy: boolean;
  send: (command: ScenarioCommand) => Promise<boolean>;
}) {
  const oxygen = patient.oxygenOptions[0]!;
  const fluid = patient.fluids[0]!;
  const [oxygenSetting, setOxygenSetting] = useState(oxygen.minimum);
  const [volume, setVolume] = useState("100");
  const [rate, setRate] = useState("500");
  const authorization = state.authorizations.find(({ actionKind, itemId }) => actionKind === "fluid" && itemId === fluid.id);
  const pump = state.devices.fluidPump;
  return <div className="oxygen-iv-panel">
    <section className="control-group">
      <h3>Oxygen</h3>
      <p>Tubing/device: {state.devices.oxygen.status === "running" ? `${oxygen.name} connected` : "not applied"}<br />
        Current setting: {state.devices.oxygen.status === "running" ? `${state.devices.oxygen.setting} ${state.devices.oxygen.unit}` : "off"}</p>
      <form onSubmit={(event) => { event.preventDefault(); void send({ type: "set_oxygen", deviceId: oxygen.id, setting: oxygenSetting, unit: oxygen.unit }); }}>
        <label>{oxygen.name} · {oxygen.settingLabel}
          <input aria-label="Oxygen flow" type="number" min={oxygen.minimum} max={oxygen.maximum} step={oxygen.step} value={oxygenSetting} onChange={(event) => setOxygenSetting(Number(event.target.value))} />
        </label>
        <div className="actions"><button disabled={busy}>{state.devices.oxygen.status === "running" ? "Adjust oxygen" : "Apply oxygen"}</button>
          <button type="button" className="secondary" disabled={busy || state.devices.oxygen.status !== "running"} onClick={() => void send({ type: "stop_oxygen" })}>Stop oxygen</button></div>
      </form>
    </section>
    <section className="control-group">
      <h3>IV access and fluid</h3>
      <p>Access: {state.devices.ivAccess.established ? "established" : "not established"} · Patency: {state.devices.ivAccess.patency.replace("_", " ")}<br />
        Pump: {pump.status} · {pump.deliveredVolumeMl.toFixed(1)} / {pump.prescribedVolumeMl.toFixed(0)} mL delivered {pump.rateMlPerHour ? `at ${pump.rateMlPerHour} mL/h` : ""}</p>
      <div className="actions">
        <button disabled={busy || state.devices.ivAccess.established} onClick={() => void send({ type: "establish_iv" })}>Establish IV access</button>
        <button className="secondary" disabled={busy || !state.devices.ivAccess.established} onClick={() => void send({ type: "inspect_iv_patency" })}>Inspect patency</button>
      </div>
      <p className="authorization">Simulated authorization: <strong>{authorization?.status ?? "not requested"}</strong></p>
      {!authorization && <button className="secondary" disabled={busy} onClick={() => void send({ type: "request_authorization", actionKind: "fluid", itemId: fluid.id })}>Request fluid authorization</button>}
      {authorization?.status === "requested" && <p className="muted">Pending senior acknowledgment at the call station.</p>}
      {pump.status !== "running" ? <form onSubmit={(event) => {
        event.preventDefault();
        void send({ type: "start_fluid", fluidId: fluid.id, volume: Number(volume), volumeUnit: "mL", rate: Number(rate), rateUnit: "mL/h" });
      }}>
        <label>Fluid<select aria-label="Fluid" value={fluid.id} onChange={() => undefined}><option value={fluid.id}>{fluid.name}</option></select></label>
        <div className="order-fields">
          <label>Volume (mL)<input aria-label="Fluid volume" type="number" min="1" max={fluid.maximumVolumeMl} value={volume} onChange={(event) => setVolume(event.target.value)} /></label>
          <label>Rate (mL/h)<input aria-label="Fluid rate" type="number" min="1" max={fluid.maximumRateMlPerHour} value={rate} onChange={(event) => setRate(event.target.value)} /></label>
        </div>
        <button disabled={busy || !state.devices.ivAccess.established || state.devices.ivAccess.patency !== "patent" || authorization?.status !== "authorized"}>Start fluid</button>
      </form> : <button disabled={busy} onClick={() => void send({ type: "stop_fluid" })}>Stop fluid</button>}
    </section>
    <p className="unavailable">Suction is visible set dressing and unavailable for this case.</p>
  </div>;
}
