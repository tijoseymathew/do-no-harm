import { describe, expect, it } from "vitest";
import { beatPeriodMs, waveform } from "./Monitor.js";
describe("fixture rhythm", () => {
  it("places one QRS per displayed HR period, independently of animation frame rate", () => {
    const period = beatPeriodMs(104);
    expect(period * 104).toBeCloseTo(60000);
    const samples = Array.from({ length: 4000 }, (_, ms) =>
      waveform((ms % period) / period, false),
    );
    const peaks = samples.filter(
      (v, i) =>
        v > 0.9 && v > (samples[i - 1] ?? 0) && v > (samples[i + 1] ?? 0),
    );
    expect(peaks).toHaveLength(7);
  });
});
