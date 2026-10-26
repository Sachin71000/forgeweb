# ForgeWeb product release audit

## Release decision: NO-GO

This is a risk-based local acceptance audit, not a certification, exhaustive penetration test, or guarantee of zero bugs. The five reproduced application defects below were corrected on 2026-10-26. Seven previously reported dependency advisories remain unresolved. Live AI-generated full-stack acceptance has not passed.

## Remediation verification — 2026-10-26

- Full regression suite: 64 tests passed, zero failures, including the original failing acceptance assertions and new edge cases.
- QA-01: loopback Host and same-origin checks reject foreign and opaque origins; JSON body routes reject other media types. This control plane is local-only; public hosting needs an explicit deployment/authentication policy.
- QA-02: export now compiles every Python source for syntax in an isolated-mode Python subprocess without executing generated code. Invalid syntax, missing interpreter, timeout, or invalid checker output blocks export. This is not a Python runtime or dependency test. Python 3 must be on PATH, or FORGEWEB_PYTHON_EXECUTABLE must point to its executable.
- QA-03: startup marks in-flight builds failed with BUILD_INTERRUPTED, persists the failure event, and does not replay provider requests. Completed builds remain intact; recovery is idempotent.
- QA-04/05: non-object JSON bodies and malformed URL encoding return structured HTTP 400 errors.
- Frontend layout and provider integrations unchanged. No Git operations or paid provider calls performed.

## Scope and evidence

- Original audit baseline: 51 cases passed when run separately.
- Original release acceptance suite: eight checks, three passed and five failed. These failures were reproduced before remediation; the expanded complete suite now passes.
- TypeScript checks and production build were run separately from acceptance tests.
- The original audit changed tests and documentation only. The remediation changed API validation, startup recovery, and Python export validation. No billing changes or deletion of saved user projects.
- Acceptance tests use a temporary local server and isolated disposable database with deterministic generation. These tests verify orchestration, not actual LLM output quality.

## Reproduced defects

| ID | Priority | Evidence | Required correction |
| --- | --- | --- | --- |
| QA-01 | P1 | POST /api/builds accepts a text/plain request with an untrusted Origin, returns 202, and creates a build. | Validate Origin/Host and content type on state-changing routes; add appropriate CSRF protection. The server acceptance is demonstrated; browser-specific private-network restrictions can affect real-world exploitability. |
| QA-02 | P1 | Appending invalid Python syntax to a generated backend, with an updated digest, still yields export validation=passed. | Execute real syntax/build/test gates in an isolated runner. Artifact presence and regex checks are not compilation or acceptance testing. |
| QA-03 | P1 | Reopening the store after an interrupted generation leaves status=generating with no worker resuming it. | Startup reconciliation: resume safely from checkpoints or mark interrupted jobs explicitly failed/retryable. |
| QA-04 | P2 | JSON null sent to POST /api/builds produces HTTP 500 and a TypeError. | Validate object-shaped request bodies before accessing prompt; return a structured 400. |
| QA-05 | P2 | GET /api/projects/%ZZ produces HTTP 500 and URIError. | Validate URL decoding and return a structured 400. |

The original failing assertions were retained and now pass after application fixes. The table records their pre-fix reproduction evidence.

## Checks that passed

- Fifty concurrent local health reads returned HTTP 200; observed total about 61 ms in this one sample. This is a smoke test, not an RPS, p95/p99 latency, production-capacity, or soak-test benchmark.
- Thirty queued concurrent database writes persisted without lost updates and survived reopening the store.
- A project could not restore another project's version.
- Baseline tests cover architecture approval, staged generation fixtures, malformed JSON, body-size limit, missing resources, version/restore/export/delete flows, provider failure handling, secret-safe errors, bounded retries, layout duplication checks, and persistence failure recovery.

## Browser smoke checks

- Homepage rendered at 1280 px desktop, 768 px tablet, and 390 px mobile widths without horizontal page overflow.
- Measured document scroll widths were 1265, 753, and 375 px respectively (scrollbar space accounts for the difference).
- Project-history drawer opened and closed.
- Mobile navigation opened with the expected links and closed successfully.
- Visible homepage hash links resolved to existing elements.
- No browser console errors were captured during this limited session.
- Viewport override was reset after testing. Screenshot: product-audit-desktop.png.

This is not a full WCAG audit: screen readers, focus trapping, reduced-motion behavior, contrast, keyboard-only completion, and every generated control remain unverified.

## Dependency vulnerability audit

`pnpm audit --json` reported seven advisories: two high, four moderate, one low; zero critical. They are in development/build dependencies, which still matter for developer machines and build environments. Exploitability was not independently demonstrated.

- source-map-js 1.2.1: high severity, GHSA-68fv-2mgg-jv7q; registry reports patched >=1.2.2.
- Vite 8.2.1: six advisories; registry reports patched >=8.2.4:
  - GHSA-587h-7wmj-h5pm (high).
  - GHSA-698v-4r3x-3vcv, GHSA-r825-w8mm-5pxw, GHSA-rq7h-c2jc-7f22, GHSA-vfpm-58rq-9qcg (moderate).
  - GHSA-9jrq-w75r-8gcw (low).

No packages were upgraded during this testing-only request. Upgrade compatible versions and rerun the registry audit plus build/regression tests before release.

## Outstanding release gates

1. QA-01 through QA-05 are fixed and regression-tested; retain these tests as release gates.
2. Resolve dependency advisories and verify the resolved dependency tree.
3. Complete a live prompt -> approval -> generated React build -> running Python backend -> interactive preview test. Recent attempts failed on provider/network limits; a successful control-plane build is not evidence of a working generated application.
4. Test generated route contracts, persistence, authorization, reservation collisions, invalid form values, and failure states.
5. Perform cross-browser, keyboard/accessibility, load/soak, backup/restore, and deployment recovery testing in an isolated staging environment.

## Reproduction commands

```powershell
node --experimental-strip-types --test server/tests/product-audit.test.ts
node --experimental-strip-types --test server/tests/*.test.ts
node node_modules/typescript/bin/tsc -b --pretty false
node node_modules/typescript/bin/tsc -p tsconfig.server.json --pretty false
node node_modules/vite/bin/vite.js build
node node_modules/typescript/bin/tsc -p tsconfig.server.build.json --pretty false
pnpm audit --json
```

Run local HTTP tests in a terminal permitted to bind and connect to localhost. Provider calls additionally require outbound network access. Never disable TLS verification to work around network failures.
