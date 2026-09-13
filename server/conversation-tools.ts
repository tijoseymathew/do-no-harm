import { z } from "zod";
import type { RunEvent } from "../shared/contracts/common.js";
import {
  ExaminerOutputSchema,
  type CasePack,
  type ExaminerOutput,
} from "../shared/contracts/server.js";
import type { MedicationOrderInput } from "../shared/contracts/scenario.js";
import { ScenarioStore } from "./scenario-store.js";

export type ToolRole = "facilitator" | "examiner";

export const TOOL_PERMISSIONS = {
  facilitator: ["get_case_fact", "get_visible_state", "prepare_action"],
  examiner: ["get_evidence", "submit_examiner_output"],
} as const;

const FactInputSchema = z.object({ key: z.string().min(1) }).strict();
const PrepareInputSchema = z
  .object({
    kind: z.literal("medication"),
    parameters: z
      .object({
        drugId: z.string().min(1),
        dose: z.number().positive().nullable(),
        unit: z.string().min(1).nullable(),
        route: z.string().min(1).nullable(),
      })
      .strict(),
  })
  .strict();
const EvidenceInputSchema = z
  .object({
    throughSequence: z.number().int().positive(),
    types: z.array(z.string().min(1)).optional(),
  })
  .strict();

function assertPermission(role: ToolRole, tool: string) {
  if (!(TOOL_PERMISSIONS[role] as readonly string[]).includes(tool)) {
    throw new Error(`${role} is not permitted to call ${tool}`);
  }
}

function safeVisibleState(state: NonNullable<ReturnType<ScenarioStore["get"]>>) {
  return {
    revision: state.revision,
    simulationTimeMs: state.simulationTimeMs,
    lifecycle: state.lifecycle,
    appearance: state.physiology.presentation,
    measurements: state.measurements,
    sensors: state.sensors,
    devices: state.devices,
    investigations: state.investigations.map(({ id, label, status, result, report }) => ({
      id,
      label,
      status,
      result,
      report,
    })),
    medication: {
      preparedOrders: state.treatments.preparedOrders,
      administrations: state.receipts,
    },
  };
}

export class ConversationTools {
  constructor(
    private readonly casePack: CasePack,
    private readonly store: ScenarioStore,
  ) {}

  async getCaseFact(runId: string, role: ToolRole, input: unknown) {
    assertPermission(role, "get_case_fact");
    const { key } = FactInputSchema.parse(input);
    const state = this.requireRun(runId);
    const briefingFacts: Record<string, { label: string; value: string | number }> = {
      patient_identity: { label: "Patient identity", value: this.casePack.patient.displayName },
      patient_age: { label: "Patient age", value: this.casePack.patient.ageYears },
      presenting_complaint: {
        label: "Presenting complaint",
        value: this.casePack.patient.presentingComplaint,
      },
      visible_appearance: { label: "Visible appearance", value: state.physiology.presentation },
    };
    if (briefingFacts[key])
      return { available: true, key, ...briefingFacts[key], unit: null, role: "nurse" as const };
    const finding = this.casePack.observations.find(
      ({ id, observableBy, studentVisible, availableAtSimulationMs }) =>
        id === key &&
        ["initial", "history", "assessment"].includes(observableBy) &&
        studentVisible &&
        availableAtSimulationMs <= state.simulationTimeMs,
    );
    if (!finding) return { available: false, key };
    let released = state.assessments.find(({ id }) => id === key);
    if (["history", "assessment"].includes(finding.observableBy)) {
      const result = await this.store.executeCurrent(runId, {
        type: "perform_assessment",
        findingId: finding.id,
      });
      if (!result || result.rejection)
        throw new Error(result?.rejection?.message ?? "Run not found");
      released = result.state.assessments.find(({ id }) => id === key);
    }
    return {
      available: true,
      key,
      label: released?.label ?? finding.label,
      value: released?.value ?? finding.value,
      unit: released?.unit ?? finding.unit ?? null,
      role: finding.observableBy === "history" ? ("patient" as const) : ("nurse" as const),
    };
  }

  getVisibleState(runId: string, role: ToolRole) {
    assertPermission(role, "get_visible_state");
    return safeVisibleState(this.requireRun(runId));
  }

  async prepareAction(
    runId: string,
    role: ToolRole,
    input: unknown,
    source: "voice" | "text" = "voice",
  ) {
    assertPermission(role, "prepare_action");
    this.requireRun(runId);
    const parsed = PrepareInputSchema.parse(input);
    const medication = this.casePack.medicationRules.find(
      ({ id }) => id === parsed.parameters.drugId,
    );
    if (!medication) throw new Error("Medication is outside the active case formulary");
    const order: MedicationOrderInput = parsed.parameters;
    const active = this.store
      .get(runId)!
      .treatments.preparedOrders.find(({ status }) => status === "prepared");
    const result = await this.store.executeCurrent(
      runId,
      active
        ? { type: "update_prepared_medication", preparedOrderId: active.id, order }
        : { type: "prepare_medication", order, source },
    );
    if (!result || result.rejection)
      throw new Error(result?.rejection?.message ?? "Scenario session not found");
    const prepared = result.state.treatments.preparedOrders.find(
      ({ status }) => status === "prepared",
    )!;
    return {
      kind: parsed.kind,
      order,
      preparedOrderId: prepared.id,
      executed: false as const,
      requiresStudentConfirmation: true as const,
    };
  }

  getEvidence(runId: string, role: ToolRole, input: unknown) {
    assertPermission(role, "get_evidence");
    this.requireRun(runId);
    const { throughSequence, types } = EvidenceInputSchema.parse(input);
    const allowed = new Set(types);
    return (this.store.events(runId) ?? [])
      .filter(
        (event) =>
          event.sequence <= throughSequence && (!types?.length || allowed.has(event.type)),
      )
      .map((event) => ({
        id: event.id,
        sequence: event.sequence,
        simulationTime: event.simulationTime,
        actor: event.actor,
        type: event.type,
        payload: event.payload,
      }));
  }

  submitExaminerOutput(
    runId: string,
    role: ToolRole,
    input: unknown,
    expectedCutoff: number,
  ): ExaminerOutput {
    assertPermission(role, "submit_examiner_output");
    this.requireRun(runId);
    const wrapper = z
      .object({
        output: ExaminerOutputSchema,
        evidenceIds: z.array(z.string().min(1)).min(1).max(100),
      })
      .strict()
      .parse(input);
    const output = wrapper.output;
    if (output.evidenceCutoffSequence !== expectedCutoff)
      throw new Error("Examiner output does not match the requested evidence cutoff");
    const evidence = (this.store.events(runId) ?? []).filter(
      ({ sequence }) => sequence <= expectedCutoff,
    );
    const knownIds = new Set(evidence.map(({ id }) => id));
    const cited = [
      ...wrapper.evidenceIds,
      ...output.criteria.flatMap(({ evidenceIds }) => evidenceIds),
      ...(output.strengthEvidenceIds ?? []),
      ...(output.priorityImprovementEvidenceIds ?? []),
    ];
    if (cited.some((id) => !knownIds.has(id)))
      throw new Error("Examiner output cites evidence outside the validated cutoff");
    if (
      [
        ...output.criteria.flatMap(({ evidenceIds }) => evidenceIds),
        ...(output.strengthEvidenceIds ?? []),
        ...(output.priorityImprovementEvidenceIds ?? []),
      ]
        .some((id) => !wrapper.evidenceIds.includes(id))
    )
      throw new Error("Examiner criterion citation was omitted from evidenceIds");
    if (output.kind === "follow_up") validateNeutralQuestion(output.followUpQuestion!);
    return output;
  }

  private requireRun(runId: string) {
    const state = this.store.get(runId);
    if (!state) throw new Error("Scenario session not found");
    return state;
  }
}

export function effectiveTranscript(events: RunEvent[]) {
  const transcript = events.filter(({ type }) => type === "transcript.recorded");
  const correctedIds = new Set(
    transcript
      .map(({ payload }) => (payload as { correctsEventId?: unknown }).correctsEventId)
      .filter((value): value is string => typeof value === "string"),
  );
  return transcript.filter(({ id }) => !correctedIds.has(id));
}

function validateNeutralQuestion(question: string) {
  if (!question.trim().endsWith("?")) throw new Error("Follow-up must be a single question");
  if ((question.match(/\?/g) ?? []).length !== 1)
    throw new Error("Only one follow-up question may be submitted");
  if (/\b(rubric|answer key|grade|score|administer|prescribe|give\s+\d)\b/i.test(question))
    throw new Error("Follow-up contains disallowed rubric or treatment instructions");
}
