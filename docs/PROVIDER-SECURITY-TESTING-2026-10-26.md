# Provider failures and security testing checklist

Date: 2026-10-26. Verdict: NOT READY for public production release.

## What caused the reported failure

This incident is not the earlier DNS failure: all three providers returned HTTP responses.

1. Gemini returned 503 UNAVAILABLE. The transport attempts transient 5xx requests up to three times, with bounded backoff. The error does not establish whether the underlying cause was overload or another service-side issue.
2. Groq returned 400 json_validate_failed. Its frontend stage requests nine files, including the standalone preview, in one JSON response. It first requests strict json_schema at 5,200 output tokens, then retries in json_object mode at 4,800. Both can fail. A large source bundle inside escaped JSON is a plausible contributing factor, not a proven cause from this error alone.
3. OpenRouter returned 402. The supplied error explicitly says 5,200 requested tokens exceed the 2,853 affordable tokens for that request. This is a credit-budget failure, not a connectivity error. Blind retries cannot supply missing credit. Simply lowering the cap can produce truncated application code.

An automated fixture reproduces the exact sequence: three Gemini attempts, two Groq format attempts, one OpenRouter attempt, then explicit failure. It verifies generated failure payloads and test credentials are not included in the resulting message. No paid provider calls were made during this audit.

## Executed testing checklist

| Area | Checks | Result / evidence |
| --- | --- | --- |
| Complete regression | All server test files | PASS: 68 tests, zero failures on final rerun |
| Exact reported incident | 503 -> 400 JSON failure -> 402 fallback chain | PASS with mocked provider responses; does not prove live generation |
| Retry behavior | Transient recovery, exhaustion, cancellation, DNS retry, connection reset not replayed | PASS |
| Non-retryable responses | 400, 401, 402, 403, 404, 429 | PASS: transport does not blindly retry |
| Model output | Gemini malformed, null, truncated, empty output and safety stop; bounded repair | PASS |
| Error disclosure | Configured secret redaction, network diagnostics, failed_generation omission | PASS for tested fixtures |
| Request bodies | Invalid JSON, null/primitives/arrays, oversized body, wrong content type | PASS |
| Request URLs | Malformed percent encoding | PASS: structured 400 |
| Cross-origin mutations | Build creation, confirmation, deletion, edit, restore, export | PASS: rejected before mutation |
| Host/metadata | Foreign Host and cross-site mutation metadata | PASS using raw HTTP for Host test |
| Project boundaries | Cannot restore another project's version | PASS; not a multi-user authorization guarantee |
| Persistence | Concurrent writes, failed write rollback, reopen | PASS |
| Restart recovery | Interrupted generation fails explicitly; persisted recovery is idempotent | PASS |
| Python export | Invalid syntax, module-level return, missing interpreter, non-execution | PASS; runtime correctness is not verified |
| Generation integrity | No silent AI-to-template fallback, duplicate-layout rejection, bounded redesign | PASS for fixtures |
| HTTP load smoke | 50 simultaneous health requests | PASS; not a capacity or soak benchmark |
| TypeScript | Frontend and server type checks | PASS during this audit |
| Production frontend | Vite build | PASS during this audit |
| Dependency advisories | pnpm audit --json | FAIL: 7 advisories (2 high, 4 moderate, 1 low) |

The initial Host test used fetch, which did not transmit the overridden Host as intended. It was corrected to use node:http without weakening the expected 403 assertion; the final complete suite passed.

## Open security and acceptance gates

- Dependency patches: registry audit reports source-map-js 1.2.1 needs >=1.2.2 and Vite 8.2.1 needs >=8.2.4. Advisories: GHSA-68fv-2mgg-jv7q, GHSA-698v-4r3x-3vcv, GHSA-r825-w8mm-5pxw, GHSA-587h-7wmj-h5pm, GHSA-9jrq-w75r-8gcw, GHSA-rq7h-c2jc-7f22, GHSA-vfpm-58rq-9qcg. No exploit was executed and no dependency was changed in this audit.
- The control plane is local-only and does not establish authenticated multi-user ownership. Origin checks are not authentication. Do not expose it publicly as a shared service.
- No request-rate limiter is present in the inspected API handler. Production cost-abuse protection, per-user quotas, concurrent-build limits, and resource-exhaustion testing remain open.
- Preview iframe uses allow-scripts/allow-forms without allow-same-origin; the preview response has CSP restrictions. This was source inspection, not an adversarial browser escape or XSS certification.
- A successful real prompt -> approved architecture -> generated React compile -> running Python backend -> interactive client preview remains unverified. No payment, reservation, login, or database workflow is certified by fixture tests.
- Generated code dependency installation/execution needs an OS/container isolation boundary, resource limits, restricted network access and secret isolation before adversarial testing. Python isolated mode for syntax checking is not such a runtime sandbox.
- Full accessibility, cross-browser journeys, prolonged load, backup/restore under process crashes, prompt-injection resistance, secret scanning of all artifacts, and generated API authorization/injection tests remain pending.
- GraphQL/OAuth/JWT-specific testing is not applicable to the inspected local control-plane API; generated products require their own security tests.

## Recommended remediation order (not implemented in this audit)

1. Split Groq/OpenRouter frontend output into bounded source/preview or file-level stages, with a shared API contract, schema validation and bounded repair. Preserve the approved product design rather than reverting to a fixed template.
2. Classify provider errors into unavailable, invalid output, quota, credit, authentication and configuration; display actionable messages instead of truncated raw JSON.
3. Add an explicit provider/model budget policy. A cheaper configured model or credit replenishment requires the user's choice; do not silently spend more or downgrade output quality.
4. Add bounded scheduling/backoff that respects provider retry guidance and total build deadlines, without replaying ambiguous paid requests.
5. Patch vulnerable dependencies and rerun audit, build and regression tests.
6. Complete isolated live full-stack acceptance before claiming a working generated website.

## Repeatable commands

```powershell
node --experimental-strip-types --test server/tests/*.test.ts
node node_modules/typescript/bin/tsc -b --pretty false
node node_modules/typescript/bin/tsc -p tsconfig.server.json --pretty false
node node_modules/vite/bin/vite.js build
pnpm audit --json
```

Local HTTP tests need permission to bind/connect to localhost. Tests use disposable data, not saved customer projects. This audit added tests/documentation only: no production logic, UI, credentials, GitHub content or billing settings changed. The API security-testing checklist guided coverage; the Karpathy guidelines kept changes scoped to evidence and regression tests. This report is not a claim that every vulnerability has been tested or eliminated.
