# Stitch design stage and bounded provider fallback

## Fresh live verification — 2026-10-30

Ran `node --use-system-ca --experimental-strip-types scripts/check-stitch.ts --generate` with network access. Saved credentials authenticated successfully (`list_projects` returned seven projects). A synthetic light-cream portfolio design created QA project `10859664341207201089` and screen `477aae77e0d2446b8170741f84a1c50c`. Fresh `get_screen` metadata and the existing authenticated download adapter returned 27,361 bytes containing complete HTML/body markup. The full check took 94 seconds. No customer source/data or OpenAI calls were used; the QA project remains in Stitch.

All 14 Stitch design/ZIP tests passed with loopback access; type-checking passed. The restricted-network attempt failed DNS resolution, so that failure was environmental rather than evidence of an invalid Stitch credential. This verifies fresh API generation and artifact download, not visual fidelity, mobile behavior or a complete generated frontend/backend build.

The user selected a $5 initial OpenAI testing budget. The planned application cap is $4 plus a $1 buffer; this ledger cap is not implemented or active yet. No OpenAI credits were purchased or consumed by this verification.

Local integration, 2026-10-28. No GitHub push was performed.

## Flow

Prompt -> existing requirements/architecture -> existing user confirmation -> Stitch design -> existing frontend/backend generation -> review/validation -> preview/export.

There is no added approval step and no redesign of the ForgeWeb shell. Stitch is used for the generated customer's visual design. The existing combined Frontend/Backend entries remain unchanged.

## Configuration

- STITCH_API_KEY: server-side Stitch credential, never VITE-prefixed.
- FORGEWEB_STITCH_ENABLED=true: requires Stitch design to succeed after approval. The example defaults to false so an unconfigured clone does not silently make design requests.
- FORGEWEB_GENERATION_MODE=frontend-dual-gemini-backend.
- FORGEWEB_BACKEND_PROVIDER=groq: backend and architecture use Groq then the distinct configured Gemini credentials.
- GEMINI_API_KEY, GEMINI_FALLBACK_API_KEY_1, GEMINI_FALLBACK_API_KEY_2: primary/backup keys. User confirmed these belong to separate Google Cloud projects. Duplicate key strings are removed; separate keys from the same project still share quota.

Frontend order: Groq -> OpenRouter -> Gemini 1 -> Gemini 2 -> Gemini 3.
Backend/architecture order with Groq override: Groq -> Gemini 1 -> Gemini 2 -> Gemini 3.
Each provider option is attempted once per stage (with its existing bounded transport/format repair behavior), not an infinite retry cycle. A quota-exhausted Gemini project can fail over to the next configured independent project. If all fail, no working application is claimed.

## Stitch behavior

The server uses @google/stitch-sdk 0.3.5 with a fixed Google endpoint and a four-minute request timeout. It creates a per-design project, requests a desktop design adaptable to mobile, downloads the HTML reference, and stores it on the approved specification. Reference HTML is supplied to the frontend model as design data, with scripts removed and a 40,000-character prompt cap. It is never executed by the server. Requirements and route contracts remain authoritative.

HTML downloads allow only HTTPS googleusercontent.com/googleapis.com hosts, reject URL credentials/redirects and cap download size. Authenticated assets on the exact stitch.googleapis.com hostname receive X-Goog-Api-Key; image/storage hosts never receive it. Signed URLs and raw SDK errors are not returned to the user.

If Stitch fails, the build returns to awaiting_confirmation with a STITCH_* error and the existing confirmation button becomes Retry Stitch & generate. Approved requirements are preserved, no source generation occurs, and retry does not redo architecture planning. Project ID, generation-started state and screen ID are checkpointed before/after external work. A retry reuses the checkpoint, refreshes get_screen metadata and polls at most three times; it does not blindly create/regenerate designs. Empty list_screens responses also try get_project.screenInstances. If Stitch still exposes no screen, open the saved project in Stitch and retry or import a ZIP. Successfully saved design context is reused for downstream repair. Automatic remote deletion is not performed.

## Diagnosed download defect (2026-10-28)

Resolved live: the authenticated Stitch API asset returns application/json with HTML in dataString, not a raw HTML document. The adapter now decodes that verified envelope after applying exact-host authentication. Retrying the saved screen (without creating/regenerating a project) returned 63,528 HTML characters with html/body markup. The authentication and envelope-decoding defect is verified fixed. A complete subsequent frontend/backend generation and its visual fidelity are not established by this artifact check.

A controlled live generation returned an HTML URL on stitch.googleapis.com. Both its original URL and a refreshed get_screen URL returned HTTP 401 without authentication. The previous adapter fetched every artifact without the Stitch key, which was incorrect for these authenticated API resources. After authentication the response was HTTP 200 with a dataString JSON envelope, revealing the second mismatch. Credentials remain excluded from storage/image hosts and redirects remain disabled. Tests cover key scoping, raw HTML and JSON envelope handling, stale-link refresh, bounded polling and retry without duplicate remote generation. A successful generated application is not implied by these tests.

Upstream also reports an empty-screen-index issue: https://github.com/google-labs-code/stitch-sdk/issues/149. Our live diagnostic project's list_screens returned an empty object; get_project did not expose screenInstances. This is separate from the confirmed HTTP 401 download defect and may still require web-UI activation or ZIP import if Stitch does not expose the saved screen.

## Verification and limits

### ZIP export fallback

While a proposal is waiting for confirmation (including a paused Stitch failure), click Import Stitch ZIP and choose an HTML/code export. POST /api/builds/:id/stitch-zip accepts application/zip up to 8 MiB, with the same Origin/Host protections as other mutations. Import does not approve the proposal or generate code; confirm afterward. The saved ZIP design is reused instead of invoking the Stitch API again.

The importer reads bounded entries into memory, never extracts/runs code, rejects traversal, duplicates, secret/config entries, symlinks, encryption, excessive file counts and expansion sizes. HTML pages and local linked CSS become design reference data; scripts are removed. Small local raster images (up to 64 KB each) can be embedded. Large images, remote assets, fonts, JavaScript components and build tools are not automatically converted into functional application code. Model reference context still has its existing size cap, so large exports can lose detail and require smaller screen exports.

No ZIP export from the user's actual Stitch project has been supplied. This fallback requires a manual Stitch export; automatic remote ZIP export/download is not implemented. A synthetic ZIP was tested through HTTP import and approval, and the rendered upload interaction was tested with mocked APIs in installed Chrome via Playwright at 1280 and 390 px. Both views preserved confirmation, showed import status, had no horizontal overflow/framework overlay or captured console errors. Browser plugin was unavailable; bundled Playwright Chromium was absent, so existing Chrome was used. No paid generation or customer-history mutation occurred during these checks. 96 automated tests, frontend/server type checks, frontend production build and server compilation passed.

92 local tests passed before the live connectivity check; TypeScript and production builds passed. Tests cover approval gating, failure/retry, saved design context, no source generation on Stitch failure, artifact boundaries and bounded quota routing. They do not guarantee visual fidelity, mobile completeness, valid provider output or a working full-stack runtime. No generated HTML from Stitch is automatically treated as functional backend-connected code.

Live check: a design call produced a screen response, but its HTML download failed with STITCH_ARTIFACT_UNAVAILABLE. No frontend/backend generation followed, no template was substituted and no complete application was claimed. Subsequent read-only inspection found no listed screens in the matching newly created project. The exact upstream cause is unconfirmed. Live end-to-end Stitch design handoff remains a release gate despite passing fixture tests.

Per-file Groq pacing, output caps and syntax repair still apply. Additional providers have their own quotas and credit policies; adding Stitch does not remove those limits. Source code for saved versions is not retroactively redesigned. See the free-tier generation report for prior live Python syntax failures.
