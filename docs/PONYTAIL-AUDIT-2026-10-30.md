# ForgeWeb: Ponytail-guided audit

## What this repo does

ForgeWeb turns a prompt into an architecture proposal. After approval it generates
React/Python source, stores versions, displays an HTML preview, and exports source.
The target confirmed by the user is a local, single-user demonstration—not a
public multi-user service. Existing layout must remain unchanged.

## Ponytail setup and audit scope

- Reviewed the requested fork `Sachin71000/ponytail` at
  `96608e078b2d5ea607c5c3b8b5a54d1c1fba6846`, package version 5.3.3.
- Read its main skill, whole-repository audit skill, package metadata, Codex
  manifest and installation instructions. It is a review instruction package,
  not a standalone security scanner or a source-code execution engine.
- Downloaded the checkout into the task scratch directory. The attempt to install
  its two instruction skills was **not executed**: the approval service hit a
  usage limit. No lifecycle hooks were enabled. Installation is not complete.
- Mapped entry points, HTTP boundaries, storage, planning/generation, preview,
  edits, versions/export, Python checks, MCP boundaries and relevant tests.
  Deep inspection concentrated on the generation and preview/workspace paths.
- Source was not submitted to another provider during this audit, even though
  the user allowed selected code-only review. No secrets or customer data were
  printed, and no GitHub writes occurred.

## Must fix

### 1. Build completion does not establish that generated apps run

**What this is:** `server/workflow.ts:363` checks paths, required artifacts,
traceability and related static conditions before marking a build complete.

**Problem:** The normal workflow does not install/build the generated frontend or
run its generated backend tests. A TypeScript type error, missing Python symbol,
or incorrect route response can survive checks that only inspect source shape.
Existing host-project tests and earlier hand-run container tests do not establish
that each newly generated application works.

**Fix:** Add an isolated execution gate for generated applications with pinned
tooling, resource/time limits, no host secrets or Docker socket, minimal network
permissions, and saved build/API/UI test evidence. Completion must distinguish
source validation from runtime verification. Do not execute generated code on the
host as a shortcut.

**If we skip it:** A green generation status can still lead to a broken client demo.

### 2. The HTML preview cannot make real backend requests

**What this is:** `server/app.ts:23` serves inline preview HTML with a restrictive
CSP; `src/components/ProjectWorkspace.tsx` embeds it in a sandboxed iframe.

**Problem:** `connect-src 'none'` blocks fetch requests. This is a useful security
boundary, but means the preview is not a running React/FastAPI deployment. A form
cannot prove backend persistence merely by displaying a confirmation inside it.

**Fix:** Retain the current safe static preview and add an isolated runtime preview
on a separate origin, connected only to that project's backend. Test an actual
write and read-back. Until then, label it as a frontend demonstration and do not
claim successful real reservations from local preview behavior.

**If we skip it:** Clients see buttons or forms that cannot complete real workflows.

### 3. “Edit with AI” does not currently call a model

**What this is:** `server/project-workspace.ts:201` implements edits using keyword
matching and fixed CSS/source-string additions.

**Problem:** A request such as replacing a testimonials section with pricing does
not cause the requested structural change; the default CSS edit only alters card
hover styles. Python backend requests can target legacy TypeScript paths that do
not exist. The stuck editing status caused by that error is fixed below, but
general AI editing itself remains unimplemented.

**Fix:** Route edit requests through the approved specification and a bounded
source-aware edit stage. Validate a candidate before creating a version and keep
the last working version on failure. Reject unsupported changes explicitly rather
than applying unrelated default styles.

**If we skip it:** The interface promises edits that the generated application
does not actually receive.

## Should fix

### 4. Standalone API startup does not load the saved local settings

**What this is:** `server/index.ts:8` creates the provider from `process.env`;
`vite.config.ts` instead loads local environment files explicitly.

**Problem:** With keys saved only in `.env.local`, starting `dev:api` or
`start:api` in an otherwise clean shell will not use them. The same project can
therefore behave differently depending on the startup command.

**Fix:** Use a documented, tested environment-loading strategy for both entry
points that preserves explicitly supplied process variables. Never expose keys
through Vite-prefixed client settings.

**If we skip it:** Switching startup commands can silently select deterministic
generation or leave external providers unavailable.

### 5. Growing per-file context can exhaust free-tier input capacity

**What this is:** `server/providers/generation-provider.ts:450` sends completed
source along with subsequent single-file generation requests.

**Problem:** The context grows throughout generation. The live gateway test before
this audit reported three routes rate-limited/on cooldown and four unable to
accept the prompt size. That response does not identify how much of the limit was
caused by accumulated source, so it is not proof that compaction alone fixes it.
The growing request payload is nevertheless a concrete capacity constraint.

**Fix:** Measure request sizes, retain the immutable API/DTO contract, and send only
relevant dependency signatures/source to each stage. Respect provider cooldowns;
never rotate keys to evade account limits or retry quota failures as JSON repairs.

**If we skip it:** A working small chat request may still fail during website
generation. Increasing output tokens alone cannot fix input limits or quota.

## Confirmed defects fixed in this audit

### 6. Rejected backend edits left a ready project stuck as “editing” — fixed

**What this is:** The edit path set project status before computing the candidate.

**Problem:** An unsupported Python backend edit threw `EDIT_TARGET_MISSING` after
the status write. The existing version stayed intact but status remained wrong.

**Fix:** Removed the premature status mutation. Candidate construction can now
fail without changing the last ready project or its version/files.

**If we had skipped it:** Users could see an editing state even though no edit
was active. The regression test reproduced `editing !== ready` before the fix.

### 7. Export rejected valid navigation-only previews — fixed

**What this is:** Generation accepts a semantic `header` or `nav`; stored-project
export validation required a literal lowercase `header` and exact doctype casing.

**Problem:** A valid AI preview using `nav` passed generation but failed export.

**Fix:** Aligned the stored preview check with accepted doctype/navigation
markup. Required complete HTML and the generated-preview marker remain enforced.

**If we had skipped it:** Users could be unable to export a valid generated site.
The new regression test failed before the change and passes afterward.

## Verification and next implementation order

- New regression cases were run before changing production code: both failed for
  the expected reasons, then passed after the fixes.
- 54 focused offline tests passed, covering workflow/workspace, gateway,
  frontend quality, Python checks, storage, contracts and design behavior.
- `npm run build` passed. `npm run typecheck` passed for frontend and server.
- These are not a new full HTTP/browser/container end-to-end pass. The previous
  162-test run predates these two workspace changes.

Next: runtime gate and truthful preview status, then isolated full-stack preview,
real bounded AI editing, consistent startup configuration, and measured context
compaction. Preserve the existing ForgeWeb visual layout throughout.

**Verdict:** The two workspace fixes are verified. A working generated-app demo is
not established until the isolated runtime/preview gap is closed.

**Not checked:** A new live full provider build, browser interactions against a
generated backend, current Docker health, a current online dependency advisory
scan, public multi-user deployment, every visual component, and historical
research/presentation assets. No claim of zero vulnerabilities is made.

## Follow-up: approved installation and testing

The user requested another approval attempt. Installation then succeeded for
`ponytail` and `ponytail-audit` at the pinned revision above under
`C:/Users/sachi/.codex/skills`. No lifecycle hooks were enabled. They become
available to normal skill discovery on the next turn.

- Docker engine 29.4.3 responded; FreeLLMAPI remained healthy throughout.
- The full regression suite after the workspace fixes passed: **164 tests**.
- Live ForgeWeb browser smoke checks passed at 1440x1000 and 390x844:
  correct page identity, nonblank content, no framework error overlay, no captured
  console/page errors, history and connector-panel opening, Escape dismissal and
  focus restoration, editable prompt, and no horizontal page overflow.
  The Browser plugin was not available; existing Playwright with headless Chrome
  was used. No builds were submitted through the UI smoke test and existing
  project data was not changed.
- The shipped reservation adapter was tested in network-disabled, read-only-root
  containers with resource limits and a fresh QA volume. Initial startup exposed
  a missing supplemental QA dependency (`email-validator`); mounting the existing
  supplemental dependency cache read-only resolved this test-environment issue.
  **26 checks passed**, including malformed input, staff access, hostile CORS,
  12 concurrent bookings without overbooking, and 20 concurrent inquiry writes.
- A new replacement container recovered the persisted bookings/inquiries and
  passed **3 additional persistence checks**. This proves the reviewed adapter,
  not a new AI-generated application's backend.
- The live isolated Cafe build reused completed source and advanced to
  `frontend/src/pages/ProductPage.tsx`, then failed with **HTTP 413**: all seven
  candidate routes rejected the request size. Therefore end-to-end generation is
  still failing. Context compaction/model-capacity work remains required; there
  is no passing newly generated full-stack browser demo to claim.
- Temporary test containers exited. Only FreeLLMAPI remained running. QA data
  volume `forgeweb-ponytail-20261030-data` is retained; no user volume was deleted.
- Screenshot and JSON evidence is in the task scratch directory, named
  `ponytail-{desktop,mobile}-{home,drawer}.png` and `ponytail-browser-smoke.json`.

The earlier “not checked” list is superseded only for the specific checks above.
Generated frontend-to-backend browser interactions, a complete successful live
AI build, online advisory scanning and public deployment remain unverified.
