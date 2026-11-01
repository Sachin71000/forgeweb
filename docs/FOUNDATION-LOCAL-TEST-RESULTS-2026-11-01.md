# React / FastAPI / SQLite foundation: implementation and local evidence

Follow-up: schema-first bindings, typed HTTP helpers and independent API workflows have since been implemented for the direct Sol path. See SCHEMA-FIRST-VERIFICATION-RESULTS-2026-11-01.md for the newer results and current boundaries. The remaining-work list below records the earlier foundation checkpoint.

Paid provider calls: paused throughout this implementation. GitHub: no push. Existing project source and user databases were not migrated or rewritten. Only synthetic QA expenses were created and deleted through the existing PocketTrack API/UI.

## Implemented generator-level changes

- Resolve TypeScript aliases, enums, literal unions, const tuples and inherited/intersection DTOs for the backend handoff. Memoize and bound expansion to avoid runaway context growth.
- Compare finite frontend choices with Python Literal/Enum/alias values, including inherited/nullable fields. Reject known finite-value mismatches without executing source.
- Include resolved frontend DTO information in the generated shared API contract artifact (v1.1).
- Supply Repository.transaction(write=True/False), nested savepoints and next_id() in the generated SQLite scaffold. CRUD shares the active connection; read-only guards prevent writes. Keep existing CRUD signatures compatible.
- Update backend instructions to use these actual supplied capabilities rather than invent an adapter. Add concise Ponytail engineering discipline and shared-category guidance.
- Execute generated backend tests in an isolated network-disabled Docker container with disposable SQLite. Probe parameter-free business GET endpoints to catch the observed healthy-/health + 503-storage failure.
- Invoke isolated verification during AI build completion when a runtime verifier is configured. Otherwise new AI versions remain pending. Executed verification failure preserves generated files and prevents a ready version.
- Revalidate legacy/static-only versions before runtime startup. Rename test-artifact checks so presence is not mistaken for execution. Change the UI badge from Verified build to Source generated.

## Evidence

| Check | Result |
| --- | --- |
| TypeScript frontend/server typecheck | Passed |
| Production frontend and server build | Passed |
| Full automated regression suite with Docker gate enabled | Passed; final test count recorded in external foundation-final-tests.log |
| SQLite scaffold transaction tests | Passed: rollback, nested rollback, read-only writes, IDs, 40 concurrent atomic record/audit writes, separate-process persistence |
| Healthy process with broken business endpoint | Rejected by isolated execution gate even when generated health test passed |
| Failed execution in BuildWorkflow | Blocked ready version, recorded exact failure, retained generated source |
| Existing PocketTrack real API/browser QA | Passed 42 assertions: CRUD, strict validation, accurate integer totals, combined filters, literal SQL-injection search, runtime restart persistence, storage viewer, desktop/mobile forms and cleanup |
| Browser | Chrome through Playwright; Browser plugin unavailable; 1440x1000 and 390x844; no page errors or Vite overlay; no mobile horizontal overflow |

The successful PocketTrack test used the already repaired project, NOT a new autonomous model generation with these foundation changes. Early browser script failures were wrong heading/button selectors and an initial-load race. The final corrected complete run passed. QA expenses were removed; final expense count and totals were zero. Audit records legitimately remain in the application's audit collection.

## Remaining work / not established

- A complete schema-first contract frozen before both code generators, with deterministic React/Python binding generation, is NOT implemented by the alias-resolution patch. Arbitrary untyped component constants, imported/generic dynamic types, nested validation semantics and every runtime validator are not fully checked.
- Supplied generated tests may be shallow. Their execution and GET probes are stronger gates, not a proof of every approved workflow. Independent domain-specific CRUD/browser scenarios still need systematic integration for every generated project.
- Protected endpoints need authenticated test scenarios. The readiness probe reports their 401/403 separately rather than claiming authenticated functionality passed. Required-parameter routes need explicit examples.
- Fresh unrelated autonomous builds remain untested because paid calls were explicitly paused. No first-pass-success percentage or 100% accuracy claim is justified.
- Exhaustive vulnerability/penetration testing, every browser, arbitrary dependency combinations and extended load/soak tests are not completed.
- Ruflo runtime swarms were not started. This work used explicit local review/implementation subagents and existing Ruflo-inspired policy, without external billed agents. Graph retrieval remains bounded supporting context, not semantic proof.

Next release gate: finish canonical contract bindings and independent scenario orchestration offline, then seek explicit permission for bounded fresh-project acceptance runs. Do not silently resume paid testing or increase the spending cap.
