# Phase 01 setup and verification evidence

Date: 13 September 2026. Environment: Linux, Node.js `v24.15.0`, npm `11.12.1`, Asia/Singapore workspace.

No secret values are retained here. Provider checks below used the server environment's configured project key.

| Command or check | Actual result | Gate relevance |
|---|---|---|
| `npm ci` | Clean lockfile install of 154 packages; audit reported 0 vulnerabilities | V01 |
| `npm run verify` | Type checks passed; 2 test files / 9 tests passed; server compiled; Vite built 3 browser files; client boundary scan passed | V01, V02, V03, V06 |
| `npm start` plus `curl` of `/`, `/api/health`, and `/api/cases/current` | Built app served; health exposed booleans/models only; case response omitted rubric and hidden medication-rule fields | V01, V03 |
| `npm run probe:examiner` | Real managed session called `get_visible_state`, consumed its result, and completed | V05 |
| Browser microphone / interruption check | Not run in this non-interactive terminal environment | V04 blocked |

The sanitized examiner receipt is [examiner-session-receipt.json](examiner-session-receipt.json). The fixture's unresolved clinical parameters and the unsigned [clinical review checklist](../clinical-review-checklist.md) keep the content labeled `draft_unreviewed`.
