# ForgeWeb Project Workspace — Implementation Plan

Status: Implemented and verified  
Date: 2026-08-19

## Objective

Extend the existing ForgeWeb generation result with a real, persistent project workspace. The existing architecture-first confirmation flow, generated-file list, validation evidence, dark visual system, and APIs remain intact.

## Existing systems reused

| Concern | Existing implementation | Extension |
|---|---|---|
| Frontend | React 19, Vite, existing ForgeWeb components and CSS | Add modular workspace and project-library components |
| Backend | TypeScript `BuildWorkflow` and native HTTP router | Add project workspace operations to the same service boundary |
| Persistence | Atomic `.forgeweb-data/forgeweb.json` store | Migrate schema and persist versions plus version file snapshots |
| Generated source | `GeneratedFile[]` manifest with content, digests, and requirements | Make immutable per-version snapshots the authoritative project source |
| Validation | Existing deterministic checks | Reuse and extend checks for preview and export readiness |
| Identity | Existing UUID-derived project/build IDs | Add UUID-derived version IDs; do not introduce a second ID system |
| UI | Existing dark, glass, acid-accent design language | Extend without replacing landing sections or generation controls |

## Domain additions

- `ProjectVersion`: number, edit prompt, modified paths, source version, creation time, validation status.
- `versionFiles`: immutable `GeneratedFile[]` snapshots keyed by version ID.
- `Project.currentVersionId` and `currentVersionNumber`.
- `GeneratedDatabaseInfo`: generated-application database metadata derived from the approved specification.
- `ExportSummary`: current-version validation evidence shown before ZIP creation.

ForgeWeb's control-plane database remains separate from the generated application's declared database.

## API additions

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/api/projects/:id/workspace` | Current files, version history, database information, and metadata |
| `GET` | `/api/projects/:id/preview` | Serve the current stored preview artifact with isolation headers |
| `POST` | `/api/projects/:id/edits` | Classify intent, patch only related files, validate, and create a version |
| `POST` | `/api/projects/:id/versions/:versionId/restore` | Select a validated stored version as current |
| `POST` | `/api/projects/:id/export/validate` | Validate the selected version and return an export summary |
| `POST` | `/api/projects/:id/export` | Create and download a real ZIP from current stored files |

## Preview strategy

The generator emits a standalone `frontend/preview.html` artifact from the same approved specification as the React source. ForgeWeb serves that exact stored file to a sandboxed iframe. No generated script receives same-origin access to ForgeWeb. Preview refreshes by changing a revision query after edits or restores.

If a project has no renderable preview artifact, the API returns `PREVIEW_UNAVAILABLE`; the UI shows a real retryable error instead of a fake preview.

## Scoped edit strategy

1. Validate the prompt.
2. Classify frontend, backend/API, database, authentication, or cross-layer intent.
3. Copy the current immutable version into a candidate snapshot.
4. Apply the smallest supported deterministic transformation to related paths only.
5. Recompute file digests.
6. Validate the complete candidate snapshot.
7. On success, persist a new immutable version and make it current.
8. On failure, discard the candidate and retain the prior working version.

This local engine is a provider-neutral edit adapter. External model-backed patch generation can later implement the same typed contract without changing storage, validation, or version safety.

## User-interface additions

- Primary `Files` and `Preview` tabs inside the existing generated-artifacts result.
- `Preview Project`, Desktop/Tablet/Mobile viewport controls, and refresh.
- Prompt-based `Edit with AI`, staged feedback, changed-file evidence, and automatic preview refresh.
- Secondary Database, Versions, and My Projects views.
- Real restore controls and persistent project reopening.
- Two-step export: validation summary, then explicit ZIP creation.

## Validation and testing

- Existing tests remain unchanged in intent and are not weakened.
- New workflow tests cover preview source, frontend-only edits, immutable versions, restore, failed edit safety, persistence, export validation, and ZIP contents.
- HTTP tests cover every new route and confirm that validation precedes export.
- Browser audit covers preview tabs, responsive modes, editing, version history, project reopening, and accessibility across existing viewports.

## Delivery sequence

1. Persistence migration and immutable version snapshots.
2. Initial preview artifact generation.
3. Workspace, edit, restore, preview, and export services.
4. HTTP routes and typed browser client.
5. Workspace and project-library UI.
6. Backend and browser regression tests.
7. Full type, test, build, and responsive audit; documentation and Git push.
