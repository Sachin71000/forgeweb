# ForgeWeb generator: root causes and release-gate testing plan

Status: execution approved for React + FastAPI + SQLite; confirmed-defect fixes and local tests implemented. See FOUNDATION-LOCAL-TEST-RESULTS-2026-11-01.md for evidence and unfinished gates. Live generation and paid repairs remain paused. No GitHub push. Existing projects, source checkpoints, SQLite records and the spending ledger must be preserved.

Latest follow-up: SCHEMA-FIRST-VERIFICATION-RESULTS-2026-11-01.md documents canonical schema generation, deterministic bindings/HTTP helpers and independent workflow/persistence gates for direct Sol generation. Fresh paid-generation acceptance remains paused; automatic browser coverage is not universal.

## What is confirmed

1. PocketTrack's stylesheet request exhausted 6,000 output tokens. The staged prompt also contained whole-bundle generation instructions. Focused CSS and single-file instructions subsequently let this build proceed. This is not proof that all output-limit failures are solved.
2. Frontend/backend share an incomplete contract. `frontend-contract.ts` extracts interface/object properties from api.ts, not component-local category constants, standalone enum values, all runtime constraints or actual HTTP behavior. PocketTrack offered Food/Bills while backend validation expected Food & dining/Housing & bills.
3. The supplied SQLite repository commits each CRUD operation separately. The generated service needed an atomic transaction adapter, left its dependency unset and intentionally returned 503. Valid Python and valid imports did not make it functional. The backend prompt has since been clarified, but a fresh autonomous build with that change remains unverified.
4. `workflow.ts` labels acceptance-test artifact presence as a passed check. Presence is not execution. Runtime startup checks React's root and FastAPI /health; business endpoints can still fail. Neither gate establishes that a user can save data.
5. Graph selection can omit decisive code. A repair received frontend excerpts rather than backend source. Explicit-path prioritization is now tested, but bounded excerpts can still be incomplete. A model must request missing context before an edit, not fabricate it.
6. Ruflo is installed (CLI help reports v3.63.3), but the generation integration explicitly identifies itself as Ruflo-inspired discipline with external runtime not invoked. Do not describe it as an executed Ruflo swarm.

The main cause is an orchestration/contract/verification gap, not simply a missing or weak API key. A model can produce individually plausible files which do not form one working application.

## Required target pipeline

Approved requirements -> frozen machine-readable application contract -> checked runtime capabilities -> bounded file generation -> durable checkpoints -> compile/import checks -> isolated API and database tests -> real browser journeys -> restart/rollback checks -> evidence-backed release.

The contract must include methods, paths, IDs, field names, money units, enum values, nullable/required fields, validation limits, error shapes, filter semantics and aggregate definitions. React and Python must consume bindings from the same contract. Unsupported requirements must be surfaced before paid generation, not converted into permanently disabled code.

## Ordered tasks and acceptance gates

| Priority | Test family | Cases | Required result |
| --- | --- | --- | --- |
| P0 | Reproduce known defects offline | Truncated stylesheet, conflicting bundle instructions, category mismatch, unbound unit-of-work, missing edit context | Each fixture fails for the specific defect before its generator fix and passes afterward |
| P0 | Canonical contract | Enum/alias resolution, optional vs null, integer IDs, INR paise, dates, request/response/error bodies, route verbs, update semantics | Frontend, backend and test expectations agree; contradictions block generation |
| P0 | Persistence capability | Default service wiring, same database path, transaction support, integer ID allocation, audit consistency | No required adapter is missing; default construction performs real CRUD |
| P0 | Prompt scope and output | One file per request, per-file context, large design references, maximum output, incomplete JSON/Python/TS/CSS | No conflicting bundle instructions; incomplete output rejected; earlier checkpoints retained |
| P0 | Executed backend tests | Empty list; create/read/update/delete; 404; invalid amount/date/category/extra fields; combined search/category filters; real totals | Correct status/body and persisted rows, not merely a test file's existence |
| P0 | Transaction integrity | Forced exception after first write; parallel writes; simultaneous updates; deleted-ID reuse | Atomic commit/rollback; valid unique IDs; no partial audit or lost records |
| P0 | Readiness and completion | Healthy /health with broken storage/business route, missing adapter, malformed response | Report process health separately; never grant functional completion on root + /health alone |
| P0 | Browser integration | Actual form submit, invalid input, edit, delete/cancel, category choices, filters, totals, network failures | Real HTTP requests reach FastAPI and match server records; no synthetic success |
| P0 | Recovery | Interrupt each file/stage, process restart, duplicate Resume, stale version, corrupt cache, failed checkpoint write | Reuse matching accepted work without duplicate charges; immutable earlier snapshots; no export bypass |
| P0 | Budget accounting | Reservation, timeout/unknown charge, concurrent calls, restart, limit boundary | Existing approved cap enforced; no paid fallback or retry beyond it; no ledger reset |
| P1 | Persistent data and viewer | Browser refresh, runtime restart, control-server restart, pagination, secret redaction, project isolation | Same intended SQLite data survives; other projects and secrets inaccessible |
| P1 | Security | Cross-origin writes, opaque sandbox escape/API access, path traversal, SQL injection, XSS, body limits, dependency/script execution | Reject unsafe input/access; generated code remains isolated; no host secrets in model context |
| P1 | Visual/accessibility | Desktop/tablet/mobile, keyboard, focus, labels, contrast, overflow, reduced motion, empty/error states | Usable responsive app, not only a screenshot or successful compiler output |
| P1 | Graph retrieval | Explicit backend files, dependencies, enums/constants, stale graph, missing CLI, truncated snippets | Required context prioritized within budget; uncertainty requests more context; graph failure does not discard work |
| P1 | Performance | Stage timings, input/output tokens, cache hits, dependency-context size, repair count | Measured results; no assumed token savings or fixture-latency claims for live providers |
| P1 | Export | Failed/pending/stale versions, secret files, runnable instructions, fresh environment | Only the exact verified version qualifies; exported source reproduces its tests |

## Independent orchestration roles

Use bounded planner/contract, frontend, backend/persistence, and independent validator responsibilities. Frontend and backend may run concurrently only after the contract and shared capabilities are frozen. Validators must execute tools and attach evidence, not vote on whether code looks correct.

Before starting Ruflo runtime agents: inspect local configuration, provider routing, external-code transmission and spending behavior. Disable unapproved provider fallbacks, unlimited loops and shared cross-project memory. Ruflo must not circumvent the existing budget ledger. Current audit uses an explicitly requested read-only review agent; this is not proof of Ruflo runtime execution.

Graphify retrieves relevant code for reviews/edits; include complete required enums and dependency signatures. It is not an API-contract verifier or database transaction test. Record retrieved source size and actual provider tokens; do not promise a percentage saving.

## Ponytail in generation

Recommended: include concise engineering rules in each bounded task: smallest complete implementation; preserve contracts and data; finish callers and tests; no placeholders, invented dependencies, unnecessary layers or success without evidence. Separate mechanical checks enforce these rules. Adding a skill paragraph alone cannot guarantee correctness or replace tests. Never copy the entire skill catalogue into each request.

## Execution and stopping policy

1. Establish failing regression fixtures and capture the current baseline without paid calls.
2. Implement canonical contract and persistence/readiness corrections in the generator, not just PocketTrack.
3. Run the offline matrix and isolated runtime/browser tests against known broken and valid fixtures.
4. After user confirmation, run fresh small Notes, PocketTrack and task-planner builds, initially sequentially, within the existing approved allowance only. Each build must pass its own workflow tests without manual source repair. One passing app does not validate all domains.
5. Stop on budget exhaustion, uncertain charge, repeated identical failure or missing authority. Save exact failure, checkpoints, cost and unverified items. Do not increase the cap implicitly.

## Evidence and current limits

Prior generator regression tests passed, but these did not establish autonomous functional success. PocketTrack required post-generation persistence and category repairs. Its API QA progressed through CRUD/filter/validation/restart checks, but the browser test stopped on an expected-heading locator timeout; that alone does not prove a broken rendered page. Investigate DOM, console and requests before classifying it.

Release report must separately state: artifacts generated, compilation checked, API tests executed, browser journeys executed, persistence checked and remaining risks. Never promise 100% accuracy or describe all vulnerabilities as eliminated.

## Decisions requested

1. Pause further paid calls until offline release-gate tests pass (recommended), or permit bounded live diagnosis now within the unchanged allowance?
2. Establish the reliable baseline on React + FastAPI + SQLite first (recommended), or include additional stacks/integrations in this first acceptance matrix?
