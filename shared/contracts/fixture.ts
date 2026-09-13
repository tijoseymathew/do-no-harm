import { z } from "zod";

export const OrderSchema = z
  .object({
    drugId: z.literal("aspirin_300mg_tablet"),
    dose: z.number().positive().finite().max(10000),
    unit: z.literal("mg"),
    route: z.literal("oral"),
  })
  .strict();
export type Order = z.infer<typeof OrderSchema>;
export const FixtureCommandSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("sensor"),
      sensor: z.enum(["ecg", "spo2", "cuff"]),
      connected: z.boolean(),
    })
    .strict(),
  z.object({ type: z.literal("measure_bp") }).strict(),
  z
    .object({
      type: z.literal("advance"),
      seconds: z.number().int().min(1).max(300),
    })
    .strict(),
  z.object({ type: z.literal("administer"), order: OrderSchema }).strict(),
]);
export type FixtureCommand = z.infer<typeof FixtureCommandSchema>;
export interface Receipt extends Order {
  id: string;
  simulationTimeMs: number;
  actor: "student";
  status: "administered";
  mode: "fixture";
}
export interface FixtureState {
  id: string;
  revision: number;
  mode: "fixture";
  simulationTimeMs: number;
  sensors: { ecg: boolean; spo2: boolean; cuff: boolean };
  pulseRate: number;
  measurements: {
    hr: number | null;
    spo2: number | null;
    rr: number;
    bp: { value: string; measuredAtMs: number } | null;
  };
  receipts: Receipt[];
}
