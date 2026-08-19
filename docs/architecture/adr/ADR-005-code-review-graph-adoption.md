# ADR-005: Adopt Code Review Graph behind an isolated adapter

Status: Accepted  
Date: 2026-08-15

## Context

ForgeWeb needs structural repository analysis and impact navigation, while its broader product graph also needs requirements, decisions, generation provenance, security controls, and validation evidence. Code Review Graph already provides a local structural graph engine, but it is not a multi-tenant ForgeWeb service or a complete product traceability model.

## Decision

Pin Code Review Graph v2.3.7 and run it in an isolated, short-lived Python worker for each project graph job. Place a ForgeWeb-owned `CodeGraphAdapter` between CRG and the application.

Use two graph layers behind one API:

- CRG-backed structural graph and private incremental SQLite artifact;
- Postgres-backed ForgeWeb traceability overlay.

Additional constraints:

- embeddings are disabled for the MVP;
- preview updates are debounced and provisional;
- accepted Git commits trigger authoritative graph builds;
- raw SQLite and absolute paths are excluded from customer exports;
- impact output is advisory and carries evidence/confidence metadata;
- upgrades require golden-repository compatibility tests;
- an upstream fork is a last resort.

## Consequences

Positive:

- reuses a capable structural analysis engine;
- preserves a stable ForgeWeb product contract;
- isolates repositories and resource consumption;
- keeps product provenance and security semantics under ForgeWeb control;
- permits future replacement of CRG without rewriting product clients.

Negative:

- two graph layers require normalization and reconciliation;
- isolated runners and SQLite artifact lifecycle add operational work;
- static analysis limitations must be communicated in the UI;
- version upgrades are deliberate engineering projects.

## Rejected alternatives

- Store everything directly in CRG: rejected because it lacks ForgeWeb domain semantics and couples the product to an upstream schema.
- Build all structural parsing internally: rejected because it duplicates substantial existing work and delays the MVP.
- Run one shared CRG server: rejected because project isolation and repository-root lifecycle are unclear.
- Fork immediately: rejected because an adapter and upstream contributions preserve lower maintenance cost.
