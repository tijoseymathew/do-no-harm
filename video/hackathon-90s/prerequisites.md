# Recording prerequisite verification — 13 September 2026

Historical audit of the first recording attempt. The later [real debrief receipt](../../docs/evidence/phase-06/real-debrief-checkpoint.json) now records success. Follow the [revised plan](../../docs/hackathon-video-plan.md) for the completed end-to-end story; the failures below describe the earlier take.

**Result: incomplete. A submission-ready primary cut cannot yet be produced.**

| Gate | Observed result |
| --- | --- |
| Phase 5 scenario-specific Live microphone exchange | Missing. Phase 5 V01, V04 and V08 remain unchecked. Existing WebM evidence has no audio stream. This environment has no available microphone capture device; no user recording was supplied. |
| Authored briefing | Visible in actual application text; exact spoken first turn remains unverified. |
| Audible interruption / correction / disconnection recovery | Still requires real microphone-enabled verification. Text captures cannot pass these gates. |
| Real Astra checkpoint continuity | Earlier sanitized Phase 5 receipt passes active-care and handoff checkpoints in one session. The separate `continuedSessionCheck` is `skipped`. |
| Fresh staged handoff checkpoint | Failed: application request timed out; retained real-provider state reports rejected empty `evidenceIds`. No accepted question from this run is presented. |
| Real Astra debrief | `npm run verify:phase06:real` rerun failed (exit 1): `Real debrief failed: unavailable — Evaluation unavailable: Examiner did not submit a validated output`. No successful receipt was created. The fresh captured run also eventually reached `unavailable` with the same validated-output failure; its screenshots were captured while evaluation was still pending. |
| Fresh actual application footage | Captured at 1920×1080 with connected ECG and 28 seconds of actual simulation time; no dose was administered. Handoff failure paused progress. A documented browser continuation reopened the same server run and completed Finish. This is not the uninterrupted microphone-enabled primary take. |
| Exact source event | Actual preparation evidence opened in the retained run UI; empty quantity/unit/route and `administrationStatus: prepared` remain visible. |
| Clinical disclosure | Preserved in every video frame. Clinical review remains pending in phase documents. |
| Submission rules | Event/submission URL absent from repository; duration/editing/disclosure/upload rules not independently confirmed. |
| Final narration / live audio | Not supplied; review MP4 is silent. No synthetic dialogue substitutes for a real response. |

The phase documents retain their existing blocked status. Their existing automated verification reports were inspected; the simulator test suite was not rerun for this video-only change. Video lint/type checks and render/encoding validation are recorded in `out/verification.json`.

The storyboard's primary and fallback submission cuts remain blocked by missing real Live footage. The delivered review cut is an editorial preparation artifact with explicit gap labels. The successful historical checkpoint is labeled “Earlier integration verification” and never associated with the newly captured run.

Fresh run details, raw file hashes, source timestamps, evaluation state and the reconnect gap are in `sources/source-manifest.json`. The raw evidence is local and excluded from Git.

## Revised video brief — GPT Live generated voices

The user subsequently authorized GPT Live to simulate narration and patient audio, without a supplied microphone recording. That revised audiovisual cut is `out/do-no-harm-90s.mp4`. All 18 voice takes are real `gpt-live-1` output, edited as a disclosed dramatization. This completes the revised voiceover requirement; it does not retroactively pass the microphone integration gates above. The actual screen footage is still the retained text-driven run. The explanation now emphasizes the supported multiple scenario paths rather than implementation mechanics.
