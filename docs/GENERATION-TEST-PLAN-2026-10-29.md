# Generation reliability and speed investigation

Constraints: local changes and fixtures only; read-only provider access checks allowed. Ask before any live generation request. No GitHub push. User approved retaining redacted rejected source locally until diagnosis is complete.

## Evidence and priorities

- Last failed build records showed 582 and 733 seconds elapsed. These span the build lifecycle and can include approval wait; they are not isolated model-latency measurements.
- A Groq path with 14 requests at 61-second start spacing imposes 793 seconds between first and last starts, before service time, repairs or fallback. Reducing this spacing blindly would reproduce the observed account/model output quota rejection.
- Today all three Gemini keys returned HTTP 200 for read-only model listing, with the configured model present. This does not verify generateContent permission, quota or regional availability. Historical 403 remains unclassified until a redacted generation error can be inspected.
- Groq uses individual plain-source files; Gemini backend fallback still uses a five-file Base64 bundle. That inconsistency and Base64 overhead need isolated comparison before the format is changed.
- Historical rejected source was not retained. Exact syntax causes cannot be recovered from the existing file/line-only messages; do not claim the 800-token cap caused the syntax defect without output/finish evidence.

## Task and acceptance checklist

| Task | Method | Acceptance |
| --- | --- | --- |
| Preserve rejected output | Ignored local diagnostic JSON, with all configured keys/patterns redacted | No keys, request headers or secret-bearing URLs retained |
| Expose Python diagnostics | Compiler fixtures: indentation, incomplete string, invalid character, module-level return | Exact file/line/column/reason without executing source |
| Measure time | Separate quota waiting, network time, repairs and cache hits | No claim that build wall time equals model latency |
| Replay output formats | Fixtures for raw JSON source, escapes, markdown, Base64 corruption, truncation | Original data preserved; unsupported/malformed formats rejected explicitly |
| Compare provider strategies | Inspect requests and replay provider envelopes | Quantify five-file Base64 vs per-file source; no live format experiments yet |
| Validate fallback bounds | Mock 403/429/5xx/timeout/truncation across all keys | Explicit reason; finite attempts; no infinite quota cycling |
| Reuse validated work | Versioned content-addressed file cache | Same input avoids requests; changed prompt/model/context misses; corrupt cache ignored |
| Check backend contracts | Curated isolated fixtures then approved generated sample | Imports, signatures and routes agree |
| Check runtime and persistence | Isolated application tests, not arbitrary code on the host | Start, CRUD, restart, auth, collision and error paths pass |
| Check frontend integration | Compile plus browser tests with isolated data | Real API actions, responsive layout, accurate save/failure messages |
| Check Stitch | Existing artifact/checkpoint and fixtures | Design retained through backend failure; no duplicate regeneration |
| Check recovery/export | Interrupt/reopen/retry fixtures | Prior versions safe; invalid files not exported |
| Live acceptance (blocked pending permission) | First bounded diagnostic request; then agreed small portfolio/StudyNest/booking suite | Real full-stack build, API, persistence and browser checks; report failures honestly |

## Performance approach

First add safe diagnostics and replay tests. Reuse validated files for identical provider/model/task context, retain Stitch checkpoints, and avoid blindly rerunning successful stages. Never trade away validation, reduce quota spacing without provider evidence, remove requested features, or count fixture test speed as a production speedup.

Architecture input size, model output quality, whole-bundle Gemini fallback, resume UX, external quotas and provider permission errors remain separate work items. Local cache hits do not imply full project validity. Cache/raw diagnostic data remains private and ignored by Git; users may clear it when diagnosis is complete. No universal success/latency guarantee is made.

## Offline results (2026-10-29)

- 111 automated tests passed; frontend/server TypeScript checks, frontend production build and server compilation passed. Model generation was mocked. No live generation requests and no GitHub operations occurred.
- Exact Python compiler reason and column are now included alongside the path and line. A module-level return fixture produces the expected 'return outside function' diagnostic without executing source.
- Non-object model output and null HTTP envelopes are now classified as data/JSON failures rather than falsely reporting network unavailability.
- With FORGEWEB_GENERATION_DIAGNOSTICS=true, provider rejection details, finish reasons, output caps, separate pacing/network durations and syntax-rejected source are saved privately under .forgeweb-data/generation-diagnostics. Configured credentials, common key formats, secret query parameters and Bearer tokens are redacted. No prompts or request headers are recorded. Diagnostic write failures warn rather than silently approving bad code.
- Syntax-checked Python files can be reused from .forgeweb-data/generation-cache for the same provider/model/credential scope and complete file prompt. Python syntax is checked again before reuse. Changed input misses cache; corrupt digest entries and files containing configured credentials are not reused/stored. These are syntax checks, not runtime or full project acceptance.
- Fixture measurement: first backend pass 5 provider requests and 5 quota waits; identical repeat 0 additional requests/waits; changed product context caused 5 fresh requests. This does not measure production latency. Uncached frontend generation, fallback, fresh projects, lost/changed context and model failures still consume requests.
- No request spacing was reduced and no safety checks were disabled. Large first-time speed gains require a higher-capacity provider/model or a separately validated design, not ignoring the observed account quota.

## Next approval required

Before a fresh generation call, ask for a small explicit request budget. Capture one actual failing backend file and a redacted response from the permission-denied Gemini slot, then replay those exact failures offline. Do not claim the original syntax/truncation/permission defects are solved by diagnostics, cache changes, or green fixture counts. Do not overwrite existing projects or silently change the Gemini bundle strategy before this comparison.

## Approved diagnostic and subsequent implementation

The user authorized at most three diagnostic requests. Exactly three were performed: Groq produced invalid domain.py ending at raise ValueError( despite finish_reason=stop and only 185 completion tokens of an 800 cap; Gemini slot 1 produced a syntax-valid plain-source domain file in roughly seven seconds; Gemini slot 3 returned 403 with an explicit message that this project cannot use the free tier and requires billing. No source was executed, no full build was run, and no extra generation calls were made. Redacted results are under the private diagnostic directory, run diagnostic_ae0a1a1ce219451ba65e.

After the user explicitly approved the recommended changes, Gemini backend generation was switched to five dependency-ordered plain-source file stages (2,048 tokens each), syntax validation, one file-scoped repair and safe accepted-source cache reuse. No Base64 backend bundle remains in Gemini. Enabled Gemini slots now precede Groq when the backend setting is gemini. Slot 3 is disabled locally without removing its key. Groq's existing paced/plain-source mode stays enabled separately so it remains safe as the last backend fallback and the unchanged frontend route stays quota-aware.

117 tests, type checks and frontend/server builds passed after implementation, all generation mocked. No further live generation was performed and no GitHub push occurred. The expected saving is avoiding Groq's fixed request spacing on the healthy backend primary path, not a measured new full-build speedup. Frontend pacing, external quotas, output quality and runtime integration still require live acceptance under a new explicit budget.
