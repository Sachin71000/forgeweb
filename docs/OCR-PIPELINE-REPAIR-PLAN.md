# Pipeline repair plan — 29 October 2026

Scope: preserve the ForgeWeb interface, approved architecture flow, provider configuration and credentials. No GitHub changes or push.

## Evidence and review limits

The approved OCR source review covered only five server files. The initial scan skipped large files on its token budget; the follow-up produced candidates but ended with Gemini daily-quota errors. Findings require reproduction, not automatic acceptance. The live sample compiled but had disconnected create/filter controls, frontend/backend field mismatches and unsafe null-update behavior. A successful build is not proof of working interactions.

Ruflo local task tracking: review `task-1793272826124-2qk33t`; targeted repair `task-1793272855965-x7qfgf`; integration repair `task-1793272857362-29mrp0`; verification `task-1793273009734-mtnw4q`. These are local planning tasks, not evidence of autonomous agents completing work. Its optional global policy mirror failed on permissions.

## Ordered work and acceptance

1. Replace regex-only JSX checking with syntax-aware, ancestor-scoped validation. Reproduce unrelated-handler bypasses, comments, native form submission and disabled controls. This remains a static guard, not a browser-test replacement.
2. Parse frontend DTO declarations without silently dropping nested fields or truncating type/field counts. Preserve existing implementation context. Verify primitive, nested and nullable types without executing generated code.
3. Inspect visual constraints, stage completion and generation repair limits against evidence. Keep full provenance hashes and finite retries; do not reuse stale artifacts or substitute a generic template.
4. Run regression tests, both TypeScript checks and production builds. Test generated code only in isolated Docker. Exercise real forms, API validation, persistence, failed-provider paths and mobile layout.
5. Attempt a bounded live generation only with available providers. Known daily quota, disabled-key and billing failures must be reported accurately; do not repeatedly retry exhausted credentials.

## Release gate

A live end-to-end pass requires architecture approval, prompt-specific source, successful isolated frontend/backend startup, browser interactions, matching request/response fields and persistence after process restart. Unit tests alone cannot satisfy this gate. Record incomplete or blocked checks explicitly.

## Implemented and verified in this repair pass

- Added pinned runtime Babel parser for syntax-only DTO/JSX inspection.
- Removed file-wide handler exemptions; native submit and delegated controls now require relevant ancestors. Empty inline handlers and conditionally disabled dead buttons are rejected. Comments and string examples are not controls.
- Retained nested, nullable and comma-separated DTO fields, including declarations beyond the previous silent limits. Existing implementation context is merged.
- Cream checking now checks warm/light RGB values and resolves simple CSS variables rather than accepting any hexadecimal color beginning with `f`.
- Implementation completion no longer pre-completes reviewer/validator tasks.
- Removed arbitrary 1,500-character frontend module limits. Provider output limits and finite retry policies remain unchanged. Added explicit null/partial-update backend instructions; instructions alone do not prove correct runtime behavior.

Verification: all 135 automated tests passed; frontend and server type checks passed; Vite production build and server compilation passed. The new tests cover scoped handlers, nested DTO extraction and cream-color false positives.

Still pending: a new accepted live end-to-end build and runtime verification of newly generated partial updates. Previous generated artifacts remain unaccepted; these changes do not retrofit their source. OCR core coverage remains incomplete because of daily quota. No claim of production readiness or complete vulnerability coverage is made. No GitHub push was performed.

## Follow-up verification and MCP integration

The user selected read-only Google Stitch design references and Supabase development schemas, with explicit opt-in before references enter new builds. The existing UI and approval/provider flow remain unchanged apart from the drawer connector and keyboard accessibility fixes. See MCP-CONNECTIONS.md for configuration and boundaries.

All 147 automated tests, both type checks and production builds pass. Desktop/mobile Chrome checks cover MCP inspection, schema projection/selection, architecture approval, combined file entries, preview modes, database/version views, deletion of synthetic test projects, keyboard focus and error/empty/recovery states. The real port-5173 application was checked without mutating its 68 saved projects. The dependency audit now reports zero known advisories after scoped Vite/source-map patches. No configured secrets were found in the built client bundle.

Real Stitch handshake and retrieval of an existing QA screen passed. Supabase remains unconfigured, so its protocol and security checks use synthetic responses, not a live account.

Live generation did not pass end-to-end. The campaign used 16 model requests: Groq hit the conservative accumulated-input guard; OpenRouter returned credit-related 402; Gemini produced preview defects and later returned daily-quota 429. Reproduced preview problems led to nav-only HTML support, self-contained asset checks, source checkpoint reuse and one bounded preview-only repair. Dead footer links remain rejected instead of falsely accepted. The latest correction was not proven by a completed live build because quota was exhausted. No additional paid requests or billing changes were made. Docker runtime verification is tracked separately; build/test success is not a substitute for it.

Docker follow-up: the user authorized a Desktop restart. Graceful restart timed out; only Desktop/backend processes were restarted, without factory reset, volume deletion or global WSL shutdown. The engine remained unresponsive and the Desktop launch could not expose a targetable window to computer-use inspection. Fresh container runtime tests remain blocked on manual Docker recovery; they were not replaced by executing untrusted generated code on the host. The real ForgeWeb site remains running at http://127.0.0.1:5173.

## Docker recovery and runtime follow-up — 30 October 2026

The user restored Docker; Engine 29.4.3 responded successfully before and after testing. No further Desktop/engine restart was performed. Existing stopped containers and data were not changed. Fresh QA-only containers and volumes used read-only source mounts, dropped capabilities, no-new-privileges, resource limits and network-disabled execution for backend/build checks. The two temporary browser-serving containers were stopped afterward; evidence and QA data volumes were retained.

- The shipped reviewed SQLite reservation adapter passed 26 runtime checks plus three persistence checks in a second fresh container. Checks covered HTTP validation, staff access, malformed bodies, repository signatures, hostile CORS preflight, concurrent inquiries and atomic capacity control: twelve simultaneous one-seat requests produced eight bookings and four conflicts. This was not a newly generated AI backend.
- The unchanged received Cedar Studio React source compiled in Docker. Desktop 1440×1000/mobile 390×844 checks verified page identity, cream background, navigation, project rendering and contact handlers using explicit synthetic API responses. With the real backend absent, HTTP 503 produced a visible contact error and no false success. API fixtures are not an integration/persistence proof.
- Browser findings: unassociated form labels, three placeholder footer links and no visible project-loading error. The received sample remains unaccepted and was not hand-edited to disguise these defects. New source guards reject common unlabeled native fields and unhandled placeholder anchors before backend requests; generation instructions explicitly require loading/empty/error states. Dynamic/cross-component accessibility still requires browser testing.
- The received legacy Vite/esbuild dependency tree had two known advisories (one high, one moderate). A tooling-only compatibility variant pinned the shared reviewed Vite/plugin baseline, compiled the same React source, passed the same browser handler checks, and audited with zero known advisories. AI generation and deterministic fixtures now share those version pins; resolved lockfiles still need auditing.
- A Groq JSON-object fallback bypass was fixed so source quality checks apply there and during final composition as well. Regression tests cover the bypass without external requests.
- Final verification: all 153 automated tests, frontend/server type checks and production builds passed. The defective received source was replayed against the new guards and rejected with zero model calls.

Fresh live architecture-to-working-generated-backend acceptance remains unverified. No model calls were made in this runtime follow-up, so present-day quota/credit availability was not rechecked. No GitHub push or UI redesign was performed.
