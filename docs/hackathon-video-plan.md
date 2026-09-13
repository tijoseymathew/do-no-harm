# DO NO HARM — 90-second hackathon video plan

Revised 13 September 2026 after the end-to-end fixes and successful real Astra debrief. The primary story now ends with **completed feedback, an exact evidence citation, and a next-practice objective**. Use GPT Live to generate narration and dramatized learner/patient dialogue, as requested. This revision supersedes the earlier blocked-debrief plan.

## Positioning and tracks

**Promise:** “Practice the decision. See the evidence. Learn before it matters.”

**Story:** A student assesses a speaking patient, prepares an order, and overstates what they did at handoff. Astra checks the record. The completed debrief takes the student from feedback to the exact source event, then gives them something specific to practise next.

Select the two intended tracks:

1. **Best use of GPT-Live-1:** a believable bedside conversation, voice preparation, and clearly differentiated patient and learner speech.
2. **Best use of Agents API:** Astra follows the run through managed examiner checkpoints, reads recorded evidence, and returns validated questions and formative feedback.

Submission copy:

- **GPT-Live-1:** “DO NO HARM uses GPT-Live-1 for patient conversation grounded in a fictional case and visible bedside state. Spoken treatment requests become reviewable drafts; the learner confirms administration. This video uses GPT Live-generated voices for its narrated demonstration.”
- **Agents API:** “DO NO HARM uses GPT-6 Astra in a persistent managed Agents API session to examine learner decisions against recorded actions, notes, and conversation. Its questions and formative feedback pass evidence validation before publication, with citations the learner can inspect.”

Use the event's exact track names and check its editing, generated-audio, duration and upload rules when the submission form is available.

## What is now established

| Capability | Basis for the revised plan |
|---|---|
| Working end-to-end product flow | User reports the complete flow is working following the fixes. Record the current build for the final cut. |
| Real Astra debrief | [Phase 6 receipt](evidence/phase-06/real-debrief-checkpoint.json), generated at 13:12:41 UTC on 13 September: `mode: real`, `mocked: false`, `model: gpt-6-astra`, `status: ready`, six criteria, `allCitationsResolved: true`, `finish-v1`, cutoff sequence 10. |
| Persistent examiner checkpoints | [Phase 5 receipt](evidence/phase-05/real-examiner-checkpoint.json): completed active-care and handoff checkpoints in the same session; one validated question. Its separate `continuedSessionCheck` remains `skipped`. |
| GPT Live voice production | The video tooling generated and retained 18 real `gpt-live-1` voice takes, with masked session receipts, selected source intervals and an independently transcribed mix stored locally. |
| Multiple scenario paths | [Chest-pain case](../case/chest-pain.v1.ts) implements timely care, delayed care and inappropriate-action attempts. Describe these as multiple paths within the case. |
| Existing audiovisual cut | The local 90-second export has audible GPT Live speech, captions, a thumbnail and an editable Remotion composition. Its old pending-debrief footage/copy must be replaced to implement this revised plan. |

A successful feedback envelope does not mean every learner criterion was demonstrated: the real receipt appropriately includes `insufficient_evidence` outcomes. Show the actual result rather than manufacturing a perfect score.

The phase documents still contain historical completion gates, including microphone-specific checks and clinical review. Those are separate from the revised video brief: generated voices are authorized for this demonstration and are not a claim of human microphone verification. Keep the fictional/unreviewed-content disclosure.

## Creative direction

Open immediately on the patient and moving bedside monitor. Use the existing navy, teal and monitor-green palette, generous captions, restrained cuts and occasional close crops. Product footage should occupy most of the frame. No face camera is needed.

Emphasize decisions and learning rather than implementation mechanics. The scenario message is:

> “The scenario can develop along multiple paths, shaped by your decisions and timing.”

At that line, show a brief editorial overlay: **Timely care / Delayed care / Inappropriate attempts**. The current implementation is one chest-pain case with several paths; do not imply an unrelated multi-case library or unrestricted model-generated clinical outcomes.

Use a compact disclosure: **“GPT Live voices · dramatized dialogue.”** Keep **“Fictional training prototype · clinical content unreviewed”** legible. Actual product footage and real examiner evidence provide the proof; the generated soundtrack provides the presentation.

## Exact 90-second storyboard

Use the existing `DoNoHarm90` composition: **1920×1080, 30 fps, 2700 frames**. Preserve the nine named beats and frame boundaries. Adjust wording to actual footage and returned audio while keeping each beat's duration.

| Time / frames | Picture and action | Audio direction / suggested copy | Main overlay |
|---|---|---|---|
| 00–06 / 0–180 | Patient and connected monitor; title over the room. | Narrator: “The first time you manage a deteriorating patient shouldn't be the first time you've practised.” | DO NO HARM |
| 06–12 / 180–360 | Brief equipment navigation and conversation view. | Narrator: “DO NO HARM brings patient conversation, bedside equipment, and an evidence-based examiner into your browser.” | Talk. Assess. Act. Reflect. |
| 12–26 / 360–780 | Patient close crop with learner/patient captions; show the actual conversation UI if captured. | GPT Live voices: learner asks about chest pressure; patient describes heavy central pressure. Learner asks when it started; patient answers “About forty-five minutes ago, while I was resting.” | GPT-Live-1 · Patient conversation |
| 26–36 / 780–1080 | “Prepare aspirin”; zoom to the real draft and its unadministered status. | Learner: “Prepare aspirin.” Brief facilitator acknowledgment. Narrator: “Voice prepares the order. Administration still needs my confirmation.” | Prepared ≠ administered |
| 36–49 / 1080–1470 | Staged handoff claim; actual neutral Astra question; learner correction. | Learner: “I gave aspirin.” Use the question actually returned. Learner: “I prepared it, but didn't administer it.” | Astra checks the record |
| 49–60 / 1470–1800 | First show recorded evidence → Astra / Agents API → validated feedback. Then show the three supported paths. | Narrator: “Astra reads recorded evidence through the Agents API and submits validated feedback. The scenario can develop along multiple paths, shaped by your decisions and timing.” | Evidence → feedback; Multiple scenario paths |
| 60–76 / 1800–2280 | Click Finish; cut evaluation waiting. Show **completed real feedback**, open its preparation citation, and reveal the exact event. Briefly reveal the matching note/handoff. | Narrator: “The debrief connects feedback to what actually happened. Here, aspirin was prepared, with no administration receipt. Open the citation to inspect the exact event, alongside the note and handoff.” | Feedback → exact source event |
| 76–85 / 2280–2550 | Show the real next-practice objective. Add a compact proof card without covering the objective. | Narrator: “I leave with a specific next-practice objective and a record I can inspect. Astra follows the run from checkpoint to debrief.” | A clear next step |
| 85–90 / 2550–2700 | Return to the room and closing title. | Narrator: “DO NO HARM. Practise the decision. Learn before it matters.” | GPT-Live-1 + Agents API |

Aim for approximately 200–220 spoken words, including dialogue. Keep turns distinct and leave short conversational pauses. Shorten copy before increasing speech speed. Never overlap narration with the patient or examiner. An edited interruption may be used as a dramatic device, but must not be described as a recorded full-duplex verification.

## Audio and examiner evidence

Use **GPT-Live-1 for every presentation voice**. The existing production choices are Marin for narration, Coral for the learner, Cedar for the patient, Sage for the facilitator and Ash for the revoiced examiner question. Retain voice consistency across takes.

Keep patient dialogue inside the case facts. The model may add unwanted material despite a script: inspect its actual transcript, trim at complete sentence/word boundaries, or regenerate. In particular, do not retain invented onset, severity, symptoms or actions. Generate narrator commentary after choosing the product clips so the narration describes what is visible.

A revoiced examiner question must quote a real accepted examiner output. Prefer the question from the newly captured run. The earlier receipt's question is an available precedent:

> “How would you describe the documented status of aspirin in your handoff?”

If that earlier question or receipt appears, label it **“Earlier integration verification”**. Its session and cutoff must not be presented as belonging to the newly captured debrief. Generated patient/narrator speech is presentation material, not a fabricated run transcript or administration receipt.

The app's “Play spoken debrief” currently uses browser `speechSynthesis`. Use GPT Live narration over the real visual feedback for this cut; do not attribute the browser button's audio to GPT Live.

## Capture the completed flow

1. **Use the current working build.** Start a fresh fictional run; connect observations and allow real simulation time to elapse. Record at 1920×1080 with readable UI scale. Retain the authored briefing in the raw take.
2. **Record one coherent story.** Capture history, the prepared order, the staged administration claim, the actual examiner question, the correction, Finish, completed feedback, a citation click and the next-practice objective. Leave stillness around each action for editing.
3. **Retain the evidence.** Save that run's export and a sanitized receipt. Keep the raw take, run ID and capture times together. A recovery/reconnect gap or second take must be explicit in the local source manifest.
4. **Select the real feedback.** Use the captured run's accepted feedback and exact citations. If its question or feedback differs from the planned example, adapt the edit. The successful Phase 6 receipt establishes that the integration works; it does not turn an unrelated fixture screenshot into real feedback footage.
5. **Build a compact proof card.** Display only fields actually retained for the relevant run: model, masked session ID if available, checkpoint/result status, feedback validation and cutoff. The current Phase 6 receipt proves six criteria and resolved citations but does not contain a session ID or cross-checkpoint continuity field. Source those fields from the new run or label the earlier verification separately.

The primary cut now shows success. Do not retain “final debrief generation is being completed,” “evaluation unavailable,” or “remaining recording gates” as its closing message. If a new take fails, preserve its diagnostics and record a successful take on the working build before exporting this story.

## Implement the revision in the existing project

Use [`video/hackathon-90s/`](../video/hackathon-90s/README.md), with its separate package and lockfile. The plan is an update to the existing project, not a request to scaffold another renderer.

- Replace the old pending-evaluation and evidence screenshots with footage of the successful debrief and citation click.
- Replace the 60–85-second narration and captions with the completed-feedback and next-practice-objective copy above. Update the 49–60-second sentence to say validated feedback.
- Replace the old proof card's “debrief remains in development” text with the real objective and supported proof fields.
- Keep the authorized GPT Live dramatization disclosure and multiple-path explanation. Refresh the question audio if the new run produces different wording.
- Regenerate the audio edit manifest, captions and SRT after choosing the final takes. Update source mappings and hashes to the new footage.

Use hard cuts so transitions do not change the total duration. Captions should be 40–48 px at 1080p, at most two lines, inside a 64–80 px safe area. Crop for readability without covering draft status, feedback or the cited event.

## Review, export and repository contents

Deliver locally: **`do-no-harm-90s.mp4`**, matching SRT, room/title thumbnail, editable Remotion project and source manifest. Export H.264 with AAC speech. Verify 2700 frames, exactly 90 seconds, audible narration/dialogue, no clipping or black gaps, and complete word endings. Inspect all nine beats, then review once muted and once with headphones.

**Push the plan and source code only**, as requested: authored scene/script files, capture/audio/mix/render/verification tools, configuration, package manifest, lockfile and production instructions. Keep the lockfile because it fixes the dependency versions needed to reproduce the project.

Do not push raw recordings, generated audio, MP4/WebM/WAV/PCM output, screenshots, thumbnails, generated captions/SRT, copied fonts/receipts, dependency folders, caches or local run exports. Recreate copied assets and caption scaffolding with the project setup command; retain non-reproducible provider receipts and takes locally for provenance. Creating another model take can change the output, so preserve its receipt and recheck every edited audio boundary.

References: [official Remotion creation workflow](https://github.com/remotion-dev/skills/blob/main/skills/remotion-best-practices/remotion-create/REFERENCE.md), [GPT Live WebSocket guide](https://developers.openai.com/api/docs/guides/voice-websockets?api=live), [provider integration notes](provider-integrations.md), and the real integration receipts linked above.
