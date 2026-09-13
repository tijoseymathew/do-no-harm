import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { RunEvent } from "../shared/contracts/common.js";
import type { CasePack } from "../shared/contracts/server.js";
import type { ScenarioCommand, ScenarioSnapshot } from "../shared/contracts/scenario.js";
import {
  ScenarioEngine,
  type CommandEnvelope,
  type CommandResult,
} from "./scenario-engine.js";

interface StoredRun {
  engine: ScenarioEngine;
  queue: Promise<void>;
  snapshots: Array<{ throughSequence: number; state: ScenarioSnapshot }>;
  debrief: unknown | null;
}

export class ScenarioStore {
  private readonly runs = new Map<string, StoredRun>();

  constructor(
    private readonly casePack: CasePack,
    private readonly runDirectory = path.resolve("runs"),
  ) {}

  get size() {
    return this.runs.size;
  }

  async create(): Promise<ScenarioSnapshot> {
    const engine = new ScenarioEngine(this.casePack);
    this.runs.set(engine.state.id, {
      engine,
      queue: Promise.resolve(),
      snapshots: [{ throughSequence: engine.events.at(-1)!.sequence, state: engine.snapshot() }],
      debrief: null,
    });
    await this.append(engine.state.id, [
      { recordType: "case_snapshot", case: this.casePack },
      ...engine.eventLog().map((event) => ({ recordType: "event", event })),
      { recordType: "state_snapshot", state: engine.snapshot() },
    ]);
    return engine.snapshot();
  }

  get(id: string): ScenarioSnapshot | null {
    return this.runs.get(id)?.engine.snapshot() ?? null;
  }

  events(id: string) {
    return this.runs.get(id)?.engine.eventLog() ?? null;
  }

  snapshots(id: string, throughSequence = Number.MAX_SAFE_INTEGER) {
    return structuredClone(
      this.runs
        .get(id)
        ?.snapshots.filter((snapshot) => snapshot.throughSequence <= throughSequence) ?? null,
    );
  }

  setDebrief(id: string, debrief: unknown) {
    const run = this.runs.get(id);
    if (!run) return false;
    run.debrief = structuredClone(debrief);
    return true;
  }

  export(id: string) {
    const engine = this.runs.get(id)?.engine;
    if (!engine) return null;
    return {
      exportVersion: "1.0.0",
      exportedAt: new Date().toISOString(),
      case: {
        id: this.casePack.caseId,
        version: this.casePack.caseVersion,
        title: this.casePack.title,
        educationalUse: this.casePack.educationalUse,
        clinicalReviewStatus: this.casePack.clinicalReview.reviewStatus,
      },
      state: engine.snapshot(),
      events: engine.eventLog(),
      debrief: structuredClone(this.runs.get(id)?.debrief ?? null),
    };
  }

  async execute(id: string, envelope: CommandEnvelope): Promise<CommandResult | null> {
    const run = this.runs.get(id);
    if (!run) return null;
    let result: CommandResult | undefined;
    const operation = run.queue.then(async () => {
      result = run.engine.execute(envelope);
      const records: unknown[] = result.duplicate
        ? []
        : result.events.map((event) => ({ recordType: "event", event }));
      if (!result.duplicate)
        records.push({ recordType: "state_snapshot", state: result.state });
      if (!result.duplicate)
        run.snapshots.push({
          throughSequence: run.engine.events.at(-1)?.sequence ?? 0,
          state: result.state,
        });
      if (records.length) await this.append(id, records);
    });
    run.queue = operation.catch(() => undefined);
    await operation;
    return result!;
  }

  async executeCurrent(id: string, command: ScenarioCommand): Promise<CommandResult | null> {
    const run = this.runs.get(id);
    if (!run) return null;
    let result: CommandResult | undefined;
    const operation = run.queue.then(async () => {
      result = run.engine.execute({
        revision: run.engine.state.revision,
        idempotencyKey: crypto.randomUUID(),
        command,
      });
      if (!result.duplicate) {
        const records: unknown[] = result.events.map((event) => ({ recordType: "event", event }));
        records.push({ recordType: "state_snapshot", state: result.state });
        run.snapshots.push({
          throughSequence: run.engine.events.at(-1)?.sequence ?? 0,
          state: result.state,
        });
        await this.append(id, records);
      }
    });
    run.queue = operation.catch(() => undefined);
    await operation;
    return result!;
  }

  async recordEvidence(
    id: string,
    actor: RunEvent["actor"],
    type: RunEvent["type"],
    payload: RunEvent["payload"],
    metadata: { causedBy?: string } = {},
  ): Promise<RunEvent | null> {
    const run = this.runs.get(id);
    if (!run) return null;
    let event: RunEvent | undefined;
    const operation = run.queue.then(async () => {
      event = run.engine.recordEvidence(actor, type, payload, metadata);
      await this.append(id, [{ recordType: "event", event }]);
    });
    run.queue = operation.catch(() => undefined);
    await operation;
    return event!;
  }

  private async append(id: string, records: unknown[]) {
    await mkdir(this.runDirectory, { recursive: true });
    const body = records.map((record) => JSON.stringify(record)).join("\n") + "\n";
    await appendFile(path.join(this.runDirectory, `${id}.jsonl`), body, "utf8");
  }
}
