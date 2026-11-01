# Live preview: validation and version consistency repair plan

## Implementation and verification — 2026-10-30

Implemented version-pinned validation through `POST /api/projects/:id/runtime/validate`. Checks cover paths, required entrypoints, frontend contracts, Python syntax/import/repository links and an isolated TypeScript/Vite build. Results and source hashes are persisted only if the selected version and source still match. Runtime startup checks eligibility before removing any old session, requires the selected version ID over HTTP, rechecks sources during preflight/startup and only reports ready after both frontend and backend probes pass.

The Preview panel now shows pending/failed validation, a Validate this version action, per-check failure details, and a disabled Start button until eligible. Initial health-fetch errors are visible. Existing source-passed projects can also revalidate. Missing, stale and cross-origin requests are rejected. Malformed API TypeScript produces a validation failure rather than an uncaught parser error.

Vite now ignores `.forgeweb-data`: live logs revealed whole-page reloads triggered by generated graph HTML, independently explaining the disappearing interface. Generated code remains separate from ForgeWeb's watched UI source.

The affected Version 2 was genuinely checked and failed accessibility/toolchain checks; it was not manually promoted. A preserved-source Version 3 repairs only the reservation form wiring/labels and reviewed Vite dependency declarations. Actual source checks, Python checks and Docker-isolated TypeScript/Vite build passed. Live frontend/FastAPI health passed. Chrome tests at 1280px and 390px completed real availability requests and reservation POSTs (201), then verified both synthetic records in SQLite. Both records survived stopping/restarting the project's containers. The two clearly named synthetic QA bookings remain in local storage; no existing customer records were deleted.

Separate mocked browser tests verified pending Start disabled → Validate → passing Start enabled at both viewport sizes, without page errors or horizontal overflow. Browser plugin was unavailable; installed Chrome/Playwright was used. Fixture validation tests are not evidence of a newly AI-generated application's quality. No paid inference or GitHub push was used. This does not establish production readiness or guarantee zero remaining defects.

## Confirmed diagnosis

The reported message originates from `ProjectRuntime.start`: it rejects a missing current version or a version whose `validationStatus` is not `passed`, before checking Docker or starting the application.

Read-only inspection of the local SQLite store found 63 passed versions and one pending version. The pending version is selected, is Version 2, and has only one recorded passed check: Python syntax. No broken current-version pointers were found. This matches the reported condition, although the screenshot alone does not identify the project.

`scripts/repair-bloom.ts` explicitly writes the repaired version with `validationStatus: 'pending'`, records only syntax evidence, then makes it the selected version. This is a validation lifecycle gap, not proof of a Docker or provider failure. Graphify's ready state indicates only that structural indexing completed; it must never authorize runtime execution.

The UI enables Start live preview even when the selected version is pending. It displays a version number without its validation status and converts multiple distinct runtime states into the same generic static-preview label. The runtime also stops an existing session before checking the selected version's eligibility.

## Objective

Preserve the layout, generated design, sources, SQLite records, current providers and GitHub state. Make preview eligibility explicit and allow a pending repaired version to become eligible only after relevant checks actually pass. Do not simply change pending to passed in the database.

## Implementation sequence

### 1. Shared version-specific validation

- Extract reusable validation from generation, workspace export and runtime preflight rather than creating competing rules.
- Validate project/version ownership, immutable source digest, required files, source-path safety, frontend parsing, Python syntax and local import resolution.
- Run the reviewed TypeScript compiler/build commands in an isolated validation environment. Do not run generated package scripts on the host.
- Check frontend API routes against backend contracts and configuration; record each check and its bounded error details.
- Separate source eligibility from runtime readiness. Source checks passing permits a runtime attempt; it does not claim successful form submission, persistence, or production readiness.
- Persist checks against the exact version and source hash. Prevent promotion if the selection or source changes during validation. A runtime validation/build failure must be visible and must not be represented as a successful live app.

### 2. Repair-version lifecycle

- Update the repair script to use the shared validation service or explicitly create a pending version awaiting validation.
- Do not label the project ready while its selected repaired version is pending. Keep the previously passed version available for restoration.
- For this existing pending Version 2, run validation without rewriting source. Promote only if required checks pass; otherwise show actionable failures and retain previous sources/data.
- Avoid concurrent out-of-process store mutations while the app is running. Prefer an in-process workflow/API for repairs, or stop/reopen the server around maintenance so cached state cannot diverge from SQLite.

### 3. Clear preview controls

- Display `Version 2 · validation pending`, `validating`, `source checks passed`, or `validation failed` alongside the version.
- For pending versions, offer Validate this version instead of an enabled Start button. Show per-check progress and errors in the same lower workspace.
- After successful validation, enable Start live preview. Disable actions during loading, validation, edits, restore and runtime startup.
- Represent starting, stopped, failed, frontend unhealthy, backend unhealthy and Docker unavailable distinctly. Never infer a running backend from static HTML or Graphify status.
- Do not silently hide initial status-fetch errors. Clear obsolete errors after successful actions or version changes, and ignore stale responses from the previously selected version.

### 4. Version-pinned startup

- Send the selected version ID with validation/start requests; verify it still matches the server selection and belongs to the project.
- Check eligibility before stopping a currently running preview. Return a specific version-changed or validation-required response on mismatch.
- Only then check Docker/dependency readiness, materialize reviewed sources, build React and start FastAPI with existing sandbox restrictions.
- Return a live URL only after frontend and backend probes pass. On failure, clean up only that attempt's containers and preserve the application SQLite volume.
- Keep explicit user-click startup; no automatic provider calls, purchases, GitHub operations or unrelated Docker restarts.

## Verification checklist

1. Reproduce a selected pending Version 2 with Python syntax evidence only. Verify it cannot start and the UI explains why.
2. Passing validation persists checks and enables Start. Failed validation never promotes a version.
3. Invalid TSX, Python syntax, missing imports, API mismatch and unsafe paths fail with clear diagnostics.
4. Missing versions, wrong project IDs, concurrent edits/restores and stale browser requests cannot start a different version.
5. An ineligible new version does not stop an existing healthy preview.
6. Docker unavailable, missing dependency volumes, build failure and backend crash produce different truthful states and retain data.
7. A valid reviewed fixture starts actual React and FastAPI; verify health, navigation, form submission, database readback and persistence after restart.
8. Desktop/mobile: reproduce the screenshot path through Preview, validate, start, stop, restore and retry. Verify no top-of-page jump, horizontal overflow or stale status.
9. Graphify warnings must not block an otherwise valid runtime; graph success must not bypass pending/failed validation.
10. Run the existing regression suite, type-check and production build. Record fixture testing separately from a paid AI-generated end-to-end build.

## Completion criteria

The exact pending-version failure is explained and recoverable in the UI; version-specific checks gate runtime attempts; actual frontend/backend health and persistence are demonstrated; no validation status is forged. This document is a plan only. No application source or stored project validation status was changed during diagnosis.
