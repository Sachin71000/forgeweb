# FreeLLMAPI output truncation repair

## Cause

The gateway inherited whole-manifest output budgets: 5,200 tokens for nine
frontend files and 3,500 tokens for a Base64-encoded Python bundle. A successful
chat connection did not validate those larger requests. The shared truncation
message incorrectly called every response a per-file request.

## Implementation

1. Scope the new behavior to FreeLLMAPI; retain direct-provider settings and UI.
2. Generate nine frontend files sequentially, then five plain-source Python files.
   Pass completed source to subsequent requests and actual frontend DTOs to backend.
3. Request 3,200 output tokens per source file and 4,800 for the inline preview.
   Planning starts at 4,500. On truncation/invalid JSON, retry only that response
   once with twice the budget, capped at 9,600; never append partial JSON/source.
4. Persist checked files using the existing private, content-keyed evidence cache.
   Validate cached Python syntax again; retain final full-manifest and runtime gates.
5. Forward file progress through the existing workflow. Errors identify the stage
   or file and budget. Authentication/quota failures do not trigger output repair.

## Verification checklist

- [x] Regression: single-file requests and raw Python, not a Base64 bundle.
- [x] Truncated file retries once; completed predecessors are not regenerated.
- [x] Repeated truncation fails safely and names the failing file/stage.
- [x] Invalid JSON is never accepted; authentication failures are not repaired.
- [ ] Identical retry reuses checked files; changed context invalidates cache keys.
- [x] Existing frontend and backend validation remains active.
- [x] Full tests, frontend/server type checks, production build.
- [ ] Live gateway planning and source generation; report any upstream limits.

## Boundaries

More bounded requests can take longer and consume additional request quota.
The gateway may enforce a lower upstream token cap. A complete live build is
required before claiming end-to-end success. No API keys or project source are
printed in test reports, and no GitHub changes are authorized.

## Verification outcome (30 October 2026)

All 162 automated tests passed; both type checks and production build passed.
Gateway regression tests include recovery from a truncated file, 3,200/6,400
bounded budgets, 4,800 preview budget, identical-source cache reuse, and a quota
failure followed by a successful fixture resume without regenerating predecessors.

The isolated live Bloom Cafe test created an architecture and received package.json.
The stylesheet request hit HTTP 429: seven routes checked, three rate-limited/on
cooldown and four unable to accept the prompt size. A single explicit retry reused
the preceding checked file but hit the same gateway limit at the stylesheet.
The final error now names frontend/src/styles.css. No partial source was published.
The live full build and runtime checks remain unverified; provider capacity is
still required. No upstream credentials/routing settings were changed, and nothing
was pushed to GitHub. Private QA state is under
`.forgeweb-data/gateway-output-qa-1793336433507`.

## ProductPage input-size follow-up

The prior live cache showed 6,819 bytes of shared instructions, 6,942 bytes of
frontend task instructions, and a 9,404-byte completed component copied into the
next request. Added a gateway-only dependency context extractor: preserve imports,
export signatures, props/type declarations and the complete API module, omit
component implementation bodies, and summarize CSS visual evidence. Python and
preview requests still receive full prior source; their size is not proven safe.
No customer requirement or API contract is intentionally dropped.

Measured saved dependency context fell from 13,130 to 2,264 bytes. Added a
regression test for preserving props, exports and API source while removing a
large body. All 165 regression tests passed; both type checks and build passed.

A new full live retry stopped before the page on HTTP 400 (routed GPT-OSS model
failed JSON validation). A separate focused ProductPage request with reduced
context then returned HTTP 200 from `qwen/qwen3.8-27b`, `finish_reason=stop`, and
the requested file, with 16,224 input bytes excluding schema/transport envelope.
This verifies that the targeted page request is no longer rejected as HTTP 413.
However its returned JSX failed the existing parser gate. No invalid source was
published, and a complete valid frontend/backend runtime remains unverified.
