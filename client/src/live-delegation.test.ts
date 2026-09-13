import { describe, expect, it, vi } from "vitest";
import { LiveDelegationBridge } from "./live-delegation.js";

describe("Live client delegation", () => {
  it.each([true, false])("returns grounded results with the opaque delegation ID (delegation first: %s)", (first) => {
    const send = vi.fn();
    const bridge = new LiveDelegationBridge(send);
    const turn = bridge.inputChanged();
    if (first) bridge.delegate("item_original");
    bridge.resolve(turn, "Patient: The pressure started 45 minutes ago.");
    if (!first) bridge.delegate("item_original");
    bridge.delegate("item_original");
    expect(send).toHaveBeenCalledExactlyOnceWith({
      type: "session.commentary.append", delegation_id: "item_original",
      content: "Patient: The pressure started 45 minutes ago.",
    });
  });

  it("suppresses an old answer after a correction and after disconnect", () => {
    const send = vi.fn();
    const bridge = new LiveDelegationBridge(send);
    const old = bridge.inputChanged();
    bridge.delegate("item_correction");
    const current = bridge.inputChanged();
    bridge.resolve(old, "Old result");
    expect(send).not.toHaveBeenCalled();
    bridge.resolve(current, "Prepared only; no administration receipt.");
    expect(send).toHaveBeenCalledTimes(1);
    bridge.close();
    bridge.delegate("item_closed");
    bridge.resolve(current, "Late result");
    expect(send).toHaveBeenCalledTimes(1);
  });
});
