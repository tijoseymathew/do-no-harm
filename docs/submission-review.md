# Hackathon submission review

Reviewed 13 September 2026 against Best use of GPT-Live-1 and Best use of Agents API.

## Assessment

The strongest differentiator is the separation between what a learner says and what they actually do. Voice can prepare an order, but only confirmed bedside actions generate treatment receipts. The examiner checks the resulting evidence and links feedback to exact events. That is a more compelling demonstration than a generic voice chatbot or an unsupported score.

| Category | Existing strength | Review finding and improvement |
| --- | --- | --- |
| GPT-Live-1 | Real server-created WebRTC sessions, a fictional patient, transcript correction, bounded application actions | Live requested client delegation but the browser never returned its grounded result. Added the delegation response bridge, original-ID correlation, event deduplication, stale-result suppression, and browser coverage. |
| GPT-Live-1 | Natural full-duplex conversation | “Interrupt” sent input mute with no unmute. Replaced it with reversible microphone controls and explicit disconnect; natural interruption remains speech-driven. Split learner and model captions, added connection timeout and resource cleanup. |
| Agents API | Managed Astra sessions, application functions, one neutral follow-up, six evidence-cited criteria | The ordinary 10-second browser timeout also applied to slow examiner turns. Checkpoints now allow 120 seconds; reasoning holds simulation advances so its own clock does not invalidate the review. Errors remain recoverable. |
| Judge experience | Interactive 3D bedside and inspectable debrief | Added a compact first-visit guide, the submitted video link, and an explicit explanation that recording a handoff unlocks Finish. Updated stale README and integration-status documentation. |

## Verification

- The deployed site returned HTTP 200 and reported both real providers configured. Browser inspection confirmed the patient, equipment, conversation, and examiner controls were accessible.
- Type checking passed; 55 unit/contract tests passed.
- All 15 browser tests passed, including the new simulated WebRTC delegation/microphone test, treatment boundaries, recovery, transcript corrections, and citation-linked debrief. Voice/checkpoint tests were repeated after final connection cleanup changes.
- Production vinext build and browser credential/rubric boundary scan passed.
- A fresh real `npm run verify:phase06:real` completed successfully, with six criteria and every citation resolved. [Timestamped sanitized receipt](evidence/phase-06/real-debrief-checkpoint.json).

The real receipt proves the Agents API debrief contract. The simulated WebRTC test proves event handling and grounded application responses; it does not prove real microphone audio or human interruption quality.

## Video review and remaining presentation opportunity

[YouTube submission](https://www.youtube.com/watch?v=G1_KK_b_cj4): retrieved metadata identifies the video as “DoNoHarm.” Hosted playback could not be retrieved in this environment, so this review does not claim to have watched that upload. The local video source, storyboard, verification manifest, captions, and contact sheet were inspected instead.

The inspected older local cut clearly labels GPT Live dramatized dialogue and shows the prepare-versus-administer distinction well. It also shows evaluation pending and revoices an examiner question from a separately identified run. The local source may not match the uploaded cut. If the submission uses that cut, replacing its final section with the already-working, completed real debrief and a citation click would materially strengthen the Agents API case. Keep generated presentation voices distinct from a recorded human interruption test.

Remaining limitations: one authored case; bounded keyword-based transcript routing; no new human microphone/full-duplex verification; clinical content remains unreviewed. These are explicit limits, not claims of completed validation.

## Contract references

The implementation follows the official [GPT-Live client delegation guide](https://developers.openai.com/api/docs/guides/live-delegation): delegation events carry metadata rather than task text, so the application maintains transcripts and returns results using the original delegation ID. The [Agents API session guide](https://developers.openai.com/api/docs/guides/agents-api/sessions) describes asynchronous turns and session continuation. Both guides were fetched during this review and checked against the installed OpenAI SDK.
