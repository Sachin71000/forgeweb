# ForgeWeb: Graphify and bounded OpenAI generation

## Implemented local phase — 2026-10-30

The local adapter now indexes successful generated versions, validated scoped edits and restores; existing projects are indexed lazily when opened. Snapshots live under the control-plane data directory's `code-graphs/<project-hash>/<version-hash>/snapshot.json`. Content hashes prevent reuse after source changes, concurrent requests share extraction, and successful snapshots are reused. Extractions use the installed Graphify CLI in code-only mode with two workers, a 45-second timeout, bounded source/output sizes and an environment allowlist that excludes provider credentials. Temporary source copies are removed afterward. Index failures show a warning rather than failing the generated website, with a one-minute retry cooldown. No paid graph extraction is enabled.

The workspace displays graph status. Editing retrieves neighboring source paths plus bounded snippets (12,000 characters maximum; styles explicitly included for visual requests). The current scoped editor is deterministic and does not invoke a model: it continues using its existing supported transformations. Therefore no measured reduction in model token use or arbitrary AI edit capability is claimed. Graph context is now available at that boundary for a future model-based editor, without changing the active provider setup.

The lower build workspace persists during planning and generation, shows its own progress, retains the proposal while building, and keeps approval controls below the architecture. Only explicit Edit prompt/New chat actions navigate back to the composer. Desktop and mobile mocked browser checks verified planning, architecture, enabled confirmation and stable lower scroll position. Browser plugin was unavailable; installed Chrome via Playwright was used. These checks made no provider requests.

Run `node --experimental-strip-types scripts/check-graphify.ts` for a synthetic real-CLI smoke check, and `node --experimental-strip-types --test server/tests/project-graphify.test.ts` for cache, isolation, fallback and lifecycle tests. For offline full regression tests set `FORGEWEB_GRAPHIFY_ENABLED=false` before `npm test`; focused graph tests inject their own extractor. Normal app use defaults to local indexing enabled. A missing Graphify executable produces a visible warning rather than an automatic download/install. OpenAI migration and spending controls below remain planned, not implemented.

## Scope and current evidence

Preserve the existing ForgeWeb interface, architecture approval gate, exports and project history. No GitHub push and no provider migration are performed by this plan.

Graphify 0.9.97 (`graphifyy`) was installed from reviewed Graphify v8 commit `0a8cd4e1e342235fe53e881fb5d591bf0460071f`. A local code-only snapshot indexed 98 source files into 745 nodes and 2,116 edges, using no LLM calls. Three CSS files were skipped: graph retrieval cannot replace direct stylesheet inspection. Automatic generated-project indexing is not implemented yet.

Stitch is enabled and its key is configured. The main project store contained 46 specifications but no saved Stitch design objects. Fresh generation and design download therefore remain unverified; configuration alone is not a successful integration test.

## Target flow

Prompt → requirements and product-specific architecture → user approval → optional verified Stitch design → shared API contract → generated frontend and Python backend → syntax/type/contract checks → bounded repairs → isolated runtime and browser tests → validated version → local Graphify snapshot.

An edit uses approved requirements plus the version's graph to find affected files, callers, imports and tests. It then reads the actual relevant source, applies the change, validates it and creates a new version and graph. Never substitute an old template when generation fails.

## Phase 1 — local graph adapter

- Run code-only extraction in a subprocess with time, memory and output limits; no cloud or semantic LLM extraction by default.
- Index only generated source and explicitly allowed documentation. Exclude secrets, environment files, customer records, runtime databases, Git history, dependencies and build outputs.
- Store a per-project, per-version immutable graph and source hashes. Index after validated generation, edit and restore. Reject stale graphs and use hash caching for unchanged sources.
- Keep the existing requirements/review graph: it records provenance and acceptance evidence, while Graphify supplies structural code retrieval.
- Retrieve paths and short dependency summaries within a token budget, then inspect real source and API contracts. Always include relevant CSS for visual changes. Fall back to bounded direct source inspection if extraction fails; report that state truthfully.

## Phase 2 — one OpenAI provider

- Add a server-side Responses API adapter using `gpt-6.1-sol`, standard processing, structured outputs and bounded output per file.
- Use one dedicated project key for architecture, frontend, backend and repair; separate keys are not required for these stages.
- Preserve previous provider configuration without exposing it or deleting it. Switch only through an explicit generation mode; never silently route to paid alternative models.
- Keep contracts authoritative across React and FastAPI. Parse Python and TypeScript before accepting files, compile the assembled frontend, check imports and perform contract tests before runtime startup.
- Bound repairs by file and build. A truncated response must never be accepted as complete. Graph retrieval reduces input context but does not solve output truncation, incorrect code or provider quota limits.

## Phase 3 — fail-closed spending controls (required before paid live tests)

- Maintain an atomic SQLite ledger for campaign and per-build budgets, reservations and actual usage. Initially serialize paid requests to simplify accounting.
- Before each request, reserve a conservative maximum price from counted input and configured maximum output, including billable reasoning. Reject the request if it cannot fit the remaining budget.
- Charge all planning, generation, repair and external AI review calls to the same campaign. No unmetered semantic graph extraction, image generation, hosted tools or background requests.
- Pin model, processing tier and pricing assumptions; reject unknown model/pricing combinations and prohibit automatic upgrades. Keep requests below long-context pricing thresholds.
- Reconcile provider usage after success. Keep uncertain reservations on timeouts until reconciled; do not release them and retry blindly. Persist the ledger across restarts.
- Stop on exhaustion, show remaining budget and require explicit user approval to increase it. Disable automatic credit reload in provider billing.
- Provider limits can have enforcement delay. The application must reserve conservatively and keep a buffer; neither a dashboard alert nor prepaid balance alone guarantees an exact instantaneous cutoff.

## Phase 4 — validation matrix

1. Offline: graph extraction, stale detection, changed-file retrieval, exclusions, malformed graphs and failure recovery.
2. Offline: budget reservation races, restarts, timeout accounting, repair limits, pricing tiers and no-request-after-exhaustion assertions.
3. Offline: invalid JSON, truncated output, Python/TS syntax errors, import failures, API mismatch and correct HTTP errors.
4. Storage/security: SQLite persistence, migrations, rollback, project isolation, origin checks, path traversal, sensitive-field redaction and sandbox limits.
5. Runtime/browser: actual Vite and FastAPI health, desktop/mobile navigation, form submission, API response, database readback, reload, edit, version restore and export.
6. Bounded paid campaign: distinct restaurant, portfolio and store prompts; verify requested colors/layout/features differ, then test a targeted edit and persistence workflow. Record every request's usage, cost and failure.
7. Stitch: fresh generation, successful asset download/import, design traceability and browser comparison. Keep optional until this test passes.

Most regression checks need no paid inference. A new model does not automatically fix existing runtime defects. Current reviewed-fixture desktop persistence passed, but mobile save and full AI-generated end-to-end functionality remain unverified. No claim of zero remaining bugs is justified.

## Initial cost envelope

At the checked standard short-context Sol rates ($2 per million input tokens, $10 per million output tokens), a hypothetical 100,000 input + 30,000 billed output tokens costs $0.50. One million input + 300,000 output costs $5; twice that costs $10. These are token envelopes, not measured prices per website or guarantees of successful builds. Taxes, FX, tools and future pricing changes are excluded.

User-selected initial purchase: $5 prepaid, auto-reload off, with a planned $4 application campaign cap and $1 buffer. This cap is not yet implemented or active. Begin with one small paid build before expanding the campaign. Actual token measurements decide how many further tests fit. Set the provider's enforced project limit as an additional safeguard where available, not a replacement for the application ledger. Do not purchase credits or send OpenAI requests automatically.

## References

- https://github.com/Graphify-Labs/graphify
- https://developers.openai.com/api/docs/models/gpt-6.1-sol
- https://developers.openai.com/api/docs/pricing
- https://help.openai.com/en/articles/8264644-what-is-prepaid-billing
- https://help.openai.com/en/articles/9186755-managing-your-work-in-the-api-platform-with-projects
