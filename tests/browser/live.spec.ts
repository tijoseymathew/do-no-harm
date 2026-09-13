import { expect, test } from "@playwright/test";

test("Live delegation returns grounded speech and microphone controls remain reversible", async ({ page }) => {
  await page.addInitScript(() => {
    const events = new EventTarget() as EventTarget & { readyState: string; send: (data: string) => void; close: () => void };
    const sent: unknown[] = [];
    events.readyState = "open";
    events.send = (data) => sent.push(JSON.parse(data));
    events.close = () => { events.readyState = "closed"; };
    const track = { enabled: true, stop() { this.enabled = false; } };
    Object.assign(window, { liveTest: { events, sent, track } });
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      value: async () => ({ getTracks: () => [track], getAudioTracks: () => [track] }),
    });
    class Peer extends EventTarget {
      iceGatheringState = "complete";
      connectionState = "connected";
      localDescription = { sdp: "test-sdp" };
      addTrack() {}
      createDataChannel() { events.readyState = "open"; return events; }
      async createOffer() { return { type: "offer", sdp: "test-sdp" }; }
      async setLocalDescription() {}
      async setRemoteDescription() {
        events.dispatchEvent(new MessageEvent("message", { data: JSON.stringify({ type: "session.started" }) }));
      }
      close() {}
    }
    Object.defineProperty(window, "RTCPeerConnection", { value: Peer });
  });
  await page.route("**/api/live/session", (route) => route.fulfill({
    status: 201, json: { session: { id: "session_test" }, transport: { sdp: "answer" } },
  }));
  await page.route("**/live/status", (route) => route.fulfill({ json: { accepted: true } }));
  await page.goto("/");
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.getByRole("button", { name: "Connect voice", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Voice connected" })).toBeVisible();
  await page.evaluate(() => {
    const { events } = (window as any).liveTest;
    for (const event of [
      { type: "session.input_transcript.delta", delta: "When did the pressure start?" },
      { type: "session.delegation.created", delegation: { target: "client", id: "item_original" } },
    ]) events.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(event) }));
  });
  await expect(page.getByRole("region", { name: "Live conversation and captions" })).toContainText("45 minutes");
  await expect.poll(() => page.evaluate(() => (window as any).liveTest.sent)).toContainEqual({
    type: "session.commentary.append", delegation_id: "item_original",
    content: "patient: The pressure began suddenly while resting about 45 minutes before arrival.",
  });
  await page.getByRole("button", { name: "Mute microphone", exact: true }).click();
  expect(await page.evaluate(() => (window as any).liveTest.track.enabled)).toBe(false);
  await page.getByRole("button", { name: "Unmute microphone", exact: true }).click();
  expect(await page.evaluate(() => (window as any).liveTest.track.enabled)).toBe(true);
  await page.getByRole("button", { name: "Disconnect voice", exact: true }).click();
  expect(await page.evaluate(() => (window as any).liveTest.track.enabled)).toBe(false);
  expect(await page.evaluate(() => (window as any).liveTest.sent)).toContainEqual({ type: "session.close" });
  await page.getByRole("button", { name: "Connect voice", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Voice connected" })).toBeVisible();
});
