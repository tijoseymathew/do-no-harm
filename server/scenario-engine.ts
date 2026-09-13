import { randomUUID } from "node:crypto";
import { CONTRACT_VERSION, RunEventSchema, type RunEvent } from "../shared/contracts/common.js";
import type { CasePack, MedicationRule } from "../shared/contracts/server.js";
import type {
  ScenarioCommand,
  ScenarioSnapshot,
  ScenarioState,
} from "../shared/contracts/scenario.js";

export interface CommandEnvelope {
  revision: number;
  idempotencyKey: string;
  command: ScenarioCommand;
}

export interface CommandResult {
  state: ScenarioSnapshot;
  events: RunEvent[];
  duplicate: boolean;
  rejection: { status: 409 | 422; message: string } | null;
}

interface EngineOptions {
  runId?: string;
  createId?: () => string;
  now?: () => Date;
}

interface StoredResult {
  fingerprint: string;
  result: CommandResult;
}

export class ScenarioEngine {
  readonly casePack: CasePack;
  readonly state: ScenarioState;
  readonly events: RunEvent[] = [];
  private readonly createId: () => string;
  private readonly now: () => Date;
  private readonly requests = new Map<string, StoredResult>();

  constructor(casePack: CasePack, options: EngineOptions = {}) {
    this.casePack = casePack;
    this.createId = options.createId ?? randomUUID;
    this.now = options.now ?? (() => new Date());
    const baseline = casePack.scenarioRules.baseline;
    const clinicallyReviewed =
      casePack.clinicalReview.reviewStatus === "reviewed" &&
      casePack.scenarioRules.clinicalReview.reviewStatus === "reviewed" &&
      casePack.medicationRules.every(
        (rule) => rule.clinicalReview.reviewStatus === "reviewed",
      ) &&
      casePack.fluidRules.every(
        (rule) => rule.clinicalReview.reviewStatus === "reviewed",
      );
    this.state = {
      id: options.runId ?? this.createId(),
      revision: 0,
      caseVersion: casePack.caseVersion,
      mode: clinicallyReviewed ? "clinically_reviewed" : "development_fixture",
      lifecycle: "active",
      clock: { simulationTimeMs: 0, running: true, timeScale: 1 },
      physiology: { ...baseline },
      sensors: { ecg: false, spo2: false, cuff: false },
      measurements: {
        hr: null,
        spo2: null,
        rr: baseline.respiratoryRate,
        bp: null,
      },
      devices: {
        ivAccess: { established: false },
        fluidPump: {
          status: "idle",
          fluidId: null,
          prescribedVolumeMl: 0,
          rateMlPerHour: 0,
          deliveredVolumeMl: 0,
          startedAtMs: null,
        },
      },
      treatments: {
        prerequisites: {
          allergyHistoryReviewed: false,
          administrationHistoryReviewed: false,
        },
        receipts: [],
        cumulativeDoses: {},
        pendingEffects: [],
        appliedEffects: [],
      },
      senior: { requestedAtMs: null, acknowledgedAtMs: null },
      branch: {
        kind: "arrival",
        enteredAtMs: 0,
        status: "active",
        reason: "Active session at the authored baseline",
        timeoutAtMs: null,
      },
      branchHistory: [],
      lastCommandResult: null,
    };
    this.emit("system", "session.started", {
      mode: this.state.mode,
      reviewStatus: casePack.clinicalReview.reviewStatus,
    });
  }

  snapshot(): ScenarioSnapshot {
    return structuredClone({
      ...this.state,
      simulationTimeMs: this.state.clock.simulationTimeMs,
      receipts: this.state.treatments.receipts,
    });
  }

  eventLog(): RunEvent[] {
    return structuredClone(this.events);
  }

  execute(envelope: CommandEnvelope): CommandResult {
    const fingerprint = JSON.stringify(envelope.command);
    const stored = this.requests.get(envelope.idempotencyKey);
    if (stored) {
      if (stored.fingerprint !== fingerprint) {
        return this.reject(
          envelope,
          "Idempotency key already used for a different command.",
          409,
        );
      }
      return { ...structuredClone(stored.result), duplicate: true };
    }

    if (envelope.revision !== this.state.revision) {
      const result = this.reject(
        envelope,
        "State changed; refresh and review before retrying.",
        409,
      );
      this.requests.set(envelope.idempotencyKey, { fingerprint, result });
      return result;
    }
    if (this.state.lifecycle === "ended") {
      const result = this.reject(envelope, "The scenario has ended.", 409);
      this.requests.set(envelope.idempotencyKey, { fingerprint, result });
      return result;
    }

    const firstEvent = this.events.length;
    const nextRevision = this.state.revision + 1;
    const rejection = this.apply(envelope.command, envelope.idempotencyKey, nextRevision);
    this.state.revision = nextRevision;
    this.state.lastCommandResult = rejection
      ? { status: "rejected", message: rejection }
      : { status: "accepted", message: commandMessage(envelope.command) };
    const result: CommandResult = {
      state: this.snapshot(),
      events: structuredClone(this.events.slice(firstEvent)),
      duplicate: false,
      rejection: rejection ? { status: 422, message: rejection } : null,
    };
    this.requests.set(envelope.idempotencyKey, {
      fingerprint,
      result: structuredClone(result),
    });
    return result;
  }

  private apply(
    command: ScenarioCommand,
    idempotencyKey: string,
    stateVersion: number,
  ): string | null {
    switch (command.type) {
      case "pause":
        if (!this.state.clock.running)
          return this.commandRejected(
            "The simulation clock is already paused.",
            command,
            idempotencyKey,
            stateVersion,
          );
        this.state.clock.running = false;
        this.emit("presenter", "session.paused", {}, { idempotencyKey, stateVersion });
        return null;
      case "resume":
        if (this.state.clock.running)
          return this.commandRejected(
            "The simulation clock is already running.",
            command,
            idempotencyKey,
            stateVersion,
          );
        this.state.clock.running = true;
        this.emit("presenter", "session.resumed", {}, { idempotencyKey, stateVersion });
        return null;
      case "advance":
        if (!this.state.clock.running)
          return this.commandRejected(
            "Resume the simulation before advancing time.",
            command,
            idempotencyKey,
            stateVersion,
          );
        this.advance(command.seconds * 1000, idempotencyKey, stateVersion);
        return null;
      case "sensor":
        this.state.sensors[command.sensor] = command.connected;
        this.refreshConnectedMeasurements();
        this.emit(
          "student",
          "equipment.connected",
          { equipment: command.sensor, connected: command.connected },
          { idempotencyKey, stateVersion },
        );
        return null;
      case "measure_bp":
        if (!this.state.sensors.cuff)
          return this.commandRejected(
            "Connect the BP cuff first.",
            command,
            idempotencyKey,
            stateVersion,
          );
        this.state.measurements.bp = {
          systolic: this.state.physiology.systolicBp,
          diastolic: this.state.physiology.diastolicBp,
          value: `${this.state.physiology.systolicBp}/${this.state.physiology.diastolicBp}`,
          measuredAtMs: this.state.clock.simulationTimeMs,
        };
        this.emit(
          "student",
          "observation.published",
          { observation: "blood_pressure", ...this.state.measurements.bp },
          { idempotencyKey, stateVersion },
        );
        return null;
      case "confirm_medication_checks":
        this.state.treatments.prerequisites = {
          allergyHistoryReviewed: command.allergyHistoryReviewed,
          administrationHistoryReviewed: command.administrationHistoryReviewed,
        };
        this.emit(
          "student",
          "assessment.performed",
          {
            assessment: "medication_prerequisites",
            allergyHistoryReviewed: true,
            administrationHistoryReviewed: true,
          },
          { idempotencyKey, stateVersion },
        );
        return null;
      case "establish_iv":
        if (this.state.devices.ivAccess.established)
          return this.commandRejected(
            "IV access is already established.",
            command,
            idempotencyKey,
            stateVersion,
          );
        this.state.devices.ivAccess.established = true;
        this.emit(
          "student",
          "equipment.connected",
          { equipment: "iv_access", connected: true },
          { idempotencyKey, stateVersion },
        );
        return null;
      case "start_fluid":
        return this.startFluid(command, idempotencyKey, stateVersion);
      case "stop_fluid":
        if (this.state.devices.fluidPump.status !== "running")
          return this.commandRejected(
            "No fluid delivery is running.",
            command,
            idempotencyKey,
            stateVersion,
          );
        this.state.devices.fluidPump.status = "stopped";
        this.emit(
          "student",
          "fluid.stopped",
          { deliveredVolumeMl: rounded(this.state.devices.fluidPump.deliveredVolumeMl) },
          { idempotencyKey, stateVersion },
        );
        return null;
      case "administer":
        return this.administer(command.order, idempotencyKey, stateVersion);
      case "request_senior":
        if (this.state.senior.requestedAtMs !== null)
          return this.commandRejected(
            "Senior review has already been requested.",
            command,
            idempotencyKey,
            stateVersion,
          );
        this.state.senior.requestedAtMs = this.state.clock.simulationTimeMs;
        this.emit(
          "student",
          "senior.requested",
          { acknowledgementDueAtMs: this.seniorAcknowledgementDueAt() },
          { idempotencyKey, stateVersion },
        );
        this.processMilestones(stateVersion);
        return null;
      case "set_lifecycle":
        return this.setLifecycle(command.lifecycle, idempotencyKey, stateVersion);
    }
  }

  private administer(
    order: Extract<ScenarioCommand, { type: "administer" }>["order"],
    idempotencyKey: string,
    stateVersion: number,
  ): string | null {
    const rule = this.casePack.medicationRules.find(({ id }) => id === order.drugId);
    const validation = this.validateMedication(rule, order);
    const attempted = this.emit(
      "student",
      "medication.attempted",
      medicationPayload(order, validation.normalized, validation.reasons, "attempted"),
      { idempotencyKey, stateVersion },
    );
    if (validation.reasons.length || !rule || !validation.normalized) {
      const reason = validation.reasons.join(" ") || "Medication is unavailable.";
      this.emit(
        "system",
        "medication.blocked",
        medicationPayload(order, validation.normalized, validation.reasons, "blocked"),
        { causedBy: attempted.id, idempotencyKey, stateVersion },
      );
      this.enterInappropriateAttempt(reason, attempted.id, stateVersion);
      return reason;
    }

    const now = this.state.clock.simulationTimeMs;
    const current = this.state.treatments.cumulativeDoses[rule.id]?.quantity ?? 0;
    const cumulative = current + validation.normalized.quantity;
    this.state.treatments.cumulativeDoses[rule.id] = {
      quantity: cumulative,
      unit: validation.normalized.unit,
    };
    const authorization =
      rule.authorizationRule === "senior_required"
        ? this.emit(
            "nurse",
            "medication.authorized",
            medicationPayload(order, validation.normalized, [], "authorized"),
            { causedBy: attempted.id, idempotencyKey, stateVersion },
          )
        : attempted;
    const administered = this.emit(
      "student",
      "medication.administered",
      medicationPayload(order, validation.normalized, [], "administered"),
      { causedBy: authorization.id, idempotencyKey, stateVersion },
    );
    const effectDueAtMs = rule.onsetMs === null ? null : now + rule.onsetMs;
    this.state.treatments.receipts.push({
      id: administered.id,
      medicationId: rule.id,
      dose: order.dose!,
      unit: order.unit!,
      route: order.route!,
      normalizedQuantity: validation.normalized.quantity,
      normalizedUnit: validation.normalized.unit,
      cumulativeQuantity: cumulative,
      simulationTimeMs: now,
      actor: "student",
      status: "administered",
      mode: this.state.mode,
      effectDueAtMs,
    });
    if (effectDueAtMs !== null) {
      this.state.treatments.pendingEffects.push({
        id: this.createId(),
        medicationId: rule.id,
        dueAtMs: effectDueAtMs,
        causedBy: administered.id,
      });
    }
    this.afterValidAdministration(administered.id, stateVersion);
    this.processMilestones(stateVersion);
    return null;
  }

  private validateMedication(
    rule: MedicationRule | undefined,
    order: Extract<ScenarioCommand, { type: "administer" }>["order"],
  ) {
    const reasons: string[] = [];
    if (!rule) reasons.push("Medication is not in the active formulary.");
    if (order.dose === null) reasons.push("Dose is required.");
    else if (order.dose <= 0) reasons.push("Dose must be positive.");
    if (order.unit === null) reasons.push("Unit is required.");
    else if (rule && !rule.allowedUnits.includes(order.unit))
      reasons.push(`Unit ${order.unit} is not supported.`);
    if (order.route === null) reasons.push("Route is required.");
    else if (rule && !rule.allowedRoutes.includes(order.route))
      reasons.push(`Route ${order.route} is not supported.`);
    const normalized =
      rule && order.dose !== null && order.dose > 0 && order.unit !== null
        ? normalizeQuantity(order.dose, order.unit, rule.doseRule.unit)
        : null;
    if (rule && order.unit !== null && order.dose !== null && !normalized)
      reasons.push(`Unit ${order.unit} cannot be converted to ${rule.doseRule.unit}.`);
    if (rule && normalized && normalized.quantity !== rule.doseRule.quantity)
      reasons.push(
        `Dose must normalize to ${rule.doseRule.quantity} ${rule.doseRule.unit}.`,
      );
    if (rule?.requiredAccess.includes("iv") && !this.state.devices.ivAccess.established)
      reasons.push("Established IV access is required.");
    if (
      rule?.requiredObservations.includes("allergy history") &&
      !this.state.treatments.prerequisites.allergyHistoryReviewed
    )
      reasons.push("Review the allergy history first.");
    if (
      rule?.requiredObservations.includes("medication administration history") &&
      !this.state.treatments.prerequisites.administrationHistoryReviewed
    )
      reasons.push("Review the medication administration history first.");
    if (
      rule?.authorizationRule === "senior_required" &&
      this.state.senior.acknowledgedAtMs === null
    )
      reasons.push("Senior authorization is required.");
    if (rule && normalized) {
      const previous = this.state.treatments.receipts.filter(
        ({ medicationId }) => medicationId === rule.id,
      );
      const latest = previous.at(-1);
      if (
        latest &&
        rule.repeatIntervalMs !== null &&
        this.state.clock.simulationTimeMs - latest.simulationTimeMs < rule.repeatIntervalMs
      )
        reasons.push("The repeat interval has not elapsed.");
      const cumulative =
        (this.state.treatments.cumulativeDoses[rule.id]?.quantity ?? 0) +
        normalized.quantity;
      if (
        rule.cumulativeLimit &&
        (rule.cumulativeLimit.unit !== normalized.unit ||
          cumulative > rule.cumulativeLimit.quantity)
      )
        reasons.push(
          `Cumulative dose would exceed ${rule.cumulativeLimit.quantity} ${rule.cumulativeLimit.unit}.`,
        );
    }
    return { reasons: unique(reasons), normalized };
  }

  private startFluid(
    command: Extract<ScenarioCommand, { type: "start_fluid" }>,
    idempotencyKey: string,
    stateVersion: number,
  ): string | null {
    const rule = this.casePack.fluidRules.find(({ id }) => id === command.fluidId);
    const volumeMl = normalizeFluid(command.volume, command.volumeUnit, "volume");
    const rateMlPerHour = normalizeFluid(command.rate, command.rateUnit, "rate");
    const reasons: string[] = [];
    if (!rule) reasons.push("Fluid is not available in this scenario.");
    if (command.volume <= 0 || volumeMl === null)
      reasons.push("Enter a positive supported fluid volume.");
    if (command.rate <= 0 || rateMlPerHour === null)
      reasons.push("Enter a positive supported delivery rate.");
    if (!this.state.devices.ivAccess.established)
      reasons.push("Establish IV access before starting fluid.");
    if (this.state.devices.fluidPump.status === "running")
      reasons.push("Stop the current fluid delivery first.");
    if (rule && !rule.allowedVolumeUnits.includes(command.volumeUnit as "mL" | "L"))
      reasons.push(`Volume unit ${command.volumeUnit} is not supported.`);
    if (rule && !rule.allowedRateUnits.includes(command.rateUnit as "mL/h" | "L/h"))
      reasons.push(`Rate unit ${command.rateUnit} is not supported.`);
    if (rule && volumeMl !== null && volumeMl > rule.maximumVolumeMl)
      reasons.push(`Volume exceeds the ${rule.maximumVolumeMl} mL scenario limit.`);
    if (rule && rateMlPerHour !== null && rateMlPerHour > rule.maximumRateMlPerHour)
      reasons.push(`Rate exceeds the ${rule.maximumRateMlPerHour} mL/h scenario limit.`);
    if (
      rule?.authorizationRule === "senior_required" &&
      this.state.senior.acknowledgedAtMs === null
    )
      reasons.push("Senior authorization is required.");
    if (reasons.length || !rule || volumeMl === null || rateMlPerHour === null)
      return this.commandRejected(
        reasons.join(" "),
        command,
        idempotencyKey,
        stateVersion,
      );
    this.state.devices.fluidPump = {
      status: "running",
      fluidId: rule.id,
      prescribedVolumeMl: volumeMl,
      rateMlPerHour,
      deliveredVolumeMl: 0,
      startedAtMs: this.state.clock.simulationTimeMs,
    };
    this.emit(
      "student",
      "fluid.started",
      { fluidId: rule.id, volumeMl, rateMlPerHour },
      { idempotencyKey, stateVersion },
    );
    return null;
  }

  private advance(deltaMs: number, idempotencyKey: string, stateVersion: number) {
    const end = this.state.clock.simulationTimeMs + deltaMs;
    this.emit(
      "presenter",
      "presenter.intervention",
      { kind: "advance_time", deltaMs, timeScale: this.state.clock.timeScale },
      { idempotencyKey, stateVersion },
    );
    while (this.state.clock.simulationTimeMs < end) {
      const next = Math.min(end, ...this.nextMilestones(end));
      this.deliverFluid(next - this.state.clock.simulationTimeMs);
      this.state.clock.simulationTimeMs = next;
      this.processMilestones(stateVersion);
    }
    this.refreshConnectedMeasurements();
  }

  private nextMilestones(end: number): number[] {
    const now = this.state.clock.simulationTimeMs;
    const values = this.state.treatments.pendingEffects.map(({ dueAtMs }) => dueAtMs);
    const seniorDue = this.seniorAcknowledgementDueAt();
    if (seniorDue !== null) values.push(seniorDue);
    const delayedAt = this.casePack.scenarioRules.delayedCare.entersAtMs;
    if (
      now < delayedAt &&
      !this.state.treatments.receipts.length &&
      this.state.branch.status === "active"
    )
      values.push(delayedAt);
    if (this.state.branch.status === "active" && this.state.branch.timeoutAtMs !== null)
      values.push(this.state.branch.timeoutAtMs);
    const pump = this.state.devices.fluidPump;
    if (pump.status === "running") {
      const remaining = pump.prescribedVolumeMl - pump.deliveredVolumeMl;
      values.push(now + (remaining / pump.rateMlPerHour) * 3_600_000);
    }
    return values.filter((value) => value > now && value <= end);
  }

  private processMilestones(stateVersion: number) {
    const now = this.state.clock.simulationTimeMs;
    const due = this.state.treatments.pendingEffects.filter(
      ({ dueAtMs }) => dueAtMs <= now,
    );
    this.state.treatments.pendingEffects = this.state.treatments.pendingEffects.filter(
      ({ dueAtMs }) => dueAtMs > now,
    );
    for (const effect of due) {
      const rule = this.casePack.medicationRules.find(
        ({ id }) => id === effect.medicationId,
      );
      if (!rule) continue;
      this.state.treatments.appliedEffects.push({
        medicationId: rule.id,
        appliedAtMs: now,
        rule: rule.effectRule,
        causedBy: effect.causedBy,
      });
      this.emit(
        "engine",
        "treatment.effect_applied",
        { medicationId: rule.id, effectRule: rule.effectRule },
        { causedBy: effect.causedBy, stateVersion },
      );
    }
    const seniorDue = this.seniorAcknowledgementDueAt();
    if (seniorDue !== null && seniorDue <= now) {
      this.state.senior.acknowledgedAtMs = seniorDue;
      const request = [...this.events]
        .reverse()
        .find(({ type }) => type === "senior.requested");
      this.emit(
        "nurse",
        "senior.acknowledged",
        { disposition: "Senior review acknowledged; continue monitored care." },
        { causedBy: request?.id, stateVersion },
      );
    }
    if (this.state.devices.fluidPump.status === "running") {
      const pump = this.state.devices.fluidPump;
      if (pump.deliveredVolumeMl >= pump.prescribedVolumeMl) {
        pump.deliveredVolumeMl = pump.prescribedVolumeMl;
        pump.status = "completed";
        this.emit(
          "engine",
          "fluid.completed",
          { fluidId: pump.fluidId, deliveredVolumeMl: rounded(pump.deliveredVolumeMl) },
          { stateVersion },
        );
      }
    }
    this.updateBranchForTime(stateVersion);
    this.completeBranchIfEligible(stateVersion);
  }

  private deliverFluid(deltaMs: number) {
    const pump = this.state.devices.fluidPump;
    if (pump.status !== "running") return;
    pump.deliveredVolumeMl = Math.min(
      pump.prescribedVolumeMl,
      pump.deliveredVolumeMl + (pump.rateMlPerHour * deltaMs) / 3_600_000,
    );
  }

  private updateBranchForTime(stateVersion: number) {
    const now = this.state.clock.simulationTimeMs;
    const rules = this.casePack.scenarioRules;
    if (
      this.state.branch.kind === "inappropriate_attempt" &&
      this.state.branch.status === "active" &&
      this.state.branch.timeoutAtMs !== null &&
      now >= this.state.branch.timeoutAtMs
    ) {
      this.closeBranch("attempt timeout", stateVersion);
      if (now >= rules.delayedCare.entersAtMs && !this.state.treatments.receipts.length)
        this.enterDelayed(stateVersion);
      else this.enterBranch("arrival", "Returned after blocked-attempt timeout", null, stateVersion);
      return;
    }
    if (
      this.state.branch.kind === "arrival" &&
      this.state.branch.status === "active" &&
      now >= rules.delayedCare.entersAtMs &&
      !this.state.treatments.receipts.length
    ) {
      this.closeBranch("delayed-care threshold reached", stateVersion);
      this.enterDelayed(stateVersion);
      return;
    }
    if (
      this.state.branch.status === "active" &&
      this.state.branch.timeoutAtMs !== null &&
      now >= this.state.branch.timeoutAtMs
    ) {
      this.state.branch.status = "timed_out";
      this.closeBranch("bounded timeout", stateVersion, "timed_out");
    }
  }

  private afterValidAdministration(causedBy: string, stateVersion: number) {
    const now = this.state.clock.simulationTimeMs;
    if (this.state.branch.kind === "inappropriate_attempt")
      this.closeBranch("corrected administration accepted", stateVersion);
    if (this.state.branch.kind === "arrival" || this.state.branch.status !== "active") {
      if (now < this.casePack.scenarioRules.delayedCare.entersAtMs) {
        this.enterBranch(
          "timely_care",
          "Authored timely-care conditions met",
          now + this.casePack.scenarioRules.timelyCare.timeoutAfterMs,
          stateVersion,
          causedBy,
        );
      } else {
        this.enterDelayed(stateVersion, causedBy);
      }
    }
  }

  private enterInappropriateAttempt(
    reason: string,
    causedBy: string,
    stateVersion: number,
  ) {
    if (this.state.branch.status === "active")
      this.closeBranch("blocked medication attempt", stateVersion);
    this.enterBranch(
      "inappropriate_attempt",
      reason,
      this.state.clock.simulationTimeMs +
        this.casePack.scenarioRules.inappropriateAttempt.timeoutAfterMs,
      stateVersion,
      causedBy,
    );
  }

  private enterDelayed(stateVersion: number, causedBy?: string) {
    const rule = this.casePack.scenarioRules.delayedCare;
    Object.assign(this.state.physiology, rule.observations);
    this.refreshConnectedMeasurements();
    this.enterBranch(
      "delayed_care",
      "Authored delayed-care conditions met",
      rule.timesOutAtMs,
      stateVersion,
      causedBy,
    );
    this.emit(
      "engine",
      "observation.published",
      { reason: "delayed_care", observations: rule.observations },
      { causedBy, stateVersion },
    );
  }

  private completeBranchIfEligible(stateVersion: number) {
    if (this.state.branch.status !== "active") return;
    if (
      this.state.branch.kind === "timely_care" &&
      this.state.senior.acknowledgedAtMs !== null &&
      this.state.treatments.appliedEffects.length
    ) {
      this.state.branch.status = "completed";
      this.closeBranch("effect recorded and senior review acknowledged", stateVersion, "completed");
    }
    if (
      this.state.branch.kind === "delayed_care" &&
      this.state.senior.acknowledgedAtMs !== null &&
      this.state.treatments.receipts.length
    ) {
      this.state.branch.status = "completed";
      this.closeBranch("treatment accepted and senior review acknowledged", stateVersion, "completed");
    }
  }

  private enterBranch(
    kind: ScenarioState["branch"]["kind"],
    reason: string,
    timeoutAtMs: number | null,
    stateVersion: number,
    causedBy?: string,
  ) {
    this.state.branch = {
      kind,
      enteredAtMs: this.state.clock.simulationTimeMs,
      status: "active",
      reason,
      timeoutAtMs,
    };
    this.emit(
      "engine",
      "branch.entered",
      { kind, reason, timeoutAtMs },
      { causedBy, stateVersion },
    );
  }

  private closeBranch(
    outcome: string,
    stateVersion: number,
    status: "completed" | "timed_out" = "completed",
  ) {
    const branch = this.state.branch;
    branch.status = status;
    this.state.branchHistory.push({
      kind: branch.kind,
      enteredAtMs: branch.enteredAtMs,
      exitedAtMs: this.state.clock.simulationTimeMs,
      outcome,
    });
    this.emit(
      "engine",
      "branch.exited",
      { kind: branch.kind, outcome, status },
      { stateVersion },
    );
  }

  private setLifecycle(
    lifecycle: "handoff" | "debrief" | "ended",
    idempotencyKey: string,
    stateVersion: number,
  ): string | null {
    const allowed: Record<ScenarioState["lifecycle"], string[]> = {
      active: ["handoff", "ended"],
      handoff: ["debrief", "ended"],
      debrief: ["ended"],
      ended: [],
    };
    if (!allowed[this.state.lifecycle].includes(lifecycle))
      return this.commandRejected(
        `Cannot move from ${this.state.lifecycle} to ${lifecycle}.`,
        { type: "set_lifecycle", lifecycle },
        idempotencyKey,
        stateVersion,
      );
    this.state.lifecycle = lifecycle;
    if (lifecycle === "ended") this.state.clock.running = false;
    const type =
      lifecycle === "handoff"
        ? "session.handoff_started"
        : lifecycle === "debrief"
          ? "session.debrief_started"
          : "session.ended";
    this.emit("student", type, {}, { idempotencyKey, stateVersion });
    return null;
  }

  private seniorAcknowledgementDueAt(): number | null {
    return this.state.senior.requestedAtMs === null ||
      this.state.senior.acknowledgedAtMs !== null
      ? null
      : this.state.senior.requestedAtMs +
          this.casePack.scenarioRules.seniorAcknowledgementDelayMs;
  }

  private refreshConnectedMeasurements() {
    this.state.measurements.hr = this.state.sensors.ecg
      ? this.state.physiology.heartRate
      : null;
    this.state.measurements.spo2 = this.state.sensors.spo2
      ? this.state.physiology.spo2
      : null;
    this.state.measurements.rr = this.state.physiology.respiratoryRate;
  }

  private commandRejected(
    message: string,
    command: ScenarioCommand,
    idempotencyKey: string,
    stateVersion: number,
  ) {
    this.emit(
      "system",
      "command.rejected",
      { commandType: command.type, reason: message },
      { idempotencyKey, stateVersion },
    );
    return message;
  }

  private reject(
    envelope: CommandEnvelope,
    message: string,
    status: 409 | 422,
    record = true,
  ): CommandResult {
    const firstEvent = this.events.length;
    if (record)
      this.emit(
        "system",
        "command.rejected",
        { commandType: envelope.command.type, reason: message },
        { idempotencyKey: envelope.idempotencyKey },
      );
    return {
      state: this.snapshot(),
      events: structuredClone(this.events.slice(firstEvent)),
      duplicate: false,
      rejection: { status, message },
    };
  }

  private emit(
    actor: RunEvent["actor"],
    type: RunEvent["type"],
    payload: RunEvent["payload"],
    metadata: {
      causedBy?: string;
      idempotencyKey?: string;
      stateVersion?: number;
    } = {},
  ): RunEvent {
    const event = RunEventSchema.parse({
      contractVersion: CONTRACT_VERSION,
      id: this.createId(),
      runId: this.state.id,
      sequence: this.events.length + 1,
      wallTime: this.now().toISOString(),
      simulationTime: this.state.clock.simulationTimeMs,
      actor,
      type,
      payload,
      stateVersion: metadata.stateVersion ?? this.state.revision,
      caseVersion: this.casePack.caseVersion,
      ...(metadata.causedBy ? { causedBy: metadata.causedBy } : {}),
      ...(metadata.idempotencyKey
        ? { idempotencyKey: metadata.idempotencyKey }
        : {}),
    });
    this.events.push(event);
    return event;
  }
}

function medicationPayload(
  order: Extract<ScenarioCommand, { type: "administer" }>["order"],
  normalized: { quantity: number; unit: string } | null,
  reasons: string[],
  administrationStatus:
    | "attempted"
    | "blocked"
    | "authorized"
    | "administered",
) {
  return {
    medicationId: order.drugId,
    entered: { quantity: order.dose, unit: order.unit, route: order.route },
    normalized,
    validation: {
      status: reasons.length ? ("rejected" as const) : ("accepted" as const),
      reasons,
    },
    administrationStatus,
  };
}

function normalizeQuantity(quantity: number, unit: string, targetUnit: string) {
  if (unit === targetUnit) return { quantity, unit: targetUnit };
  if (unit === "g" && targetUnit === "mg")
    return { quantity: quantity * 1000, unit: targetUnit };
  if (unit === "mg" && targetUnit === "g")
    return { quantity: quantity / 1000, unit: targetUnit };
  return null;
}

function normalizeFluid(quantity: number, unit: string, kind: "volume" | "rate") {
  if (!Number.isFinite(quantity)) return null;
  if (kind === "volume") {
    if (unit === "mL") return quantity;
    if (unit === "L") return quantity * 1000;
  } else {
    if (unit === "mL/h") return quantity;
    if (unit === "L/h") return quantity * 1000;
  }
  return null;
}

function commandMessage(command: ScenarioCommand) {
  switch (command.type) {
    case "advance":
      return `Advanced simulation by ${command.seconds} seconds.`;
    case "administer":
      return "Medication administration accepted.";
    case "start_fluid":
      return "Fluid delivery started.";
    case "stop_fluid":
      return "Fluid delivery stopped.";
    default:
      return "Command accepted.";
  }
}

function unique(values: string[]) {
  return [...new Set(values)];
}

function rounded(value: number) {
  return Math.round(value * 1000) / 1000;
}
