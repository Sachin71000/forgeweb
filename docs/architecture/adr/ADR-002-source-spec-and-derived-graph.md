# ADR-002: Treat the approved specification and source as truth

Status: Accepted  
Date: 2026-08-15

## Context

ForgeWeb needs to connect user intent, generated code, tests, security evidence, and Git history. A graph is useful for navigation and reasoning, but graph extraction can be incomplete and product metadata can become stale.

If the graph itself becomes the sole source of truth, users may see a confident representation that disagrees with their approved intent or repository.

## Decision

The approved master specification is the source of truth for intended behavior. The accepted Git commit is the source of truth for implementation. The unified graph is a versioned, reproducible projection derived from those sources plus generation and validation evidence.

Every authoritative graph snapshot must reference:

- the specification version;
- the accepted Git commit SHA;
- the generation manifest version;
- graph engine and adapter versions;
- the validation run that produced its evidence.

Graph edits do not directly rewrite source or requirements. A user action initiated from the graph must become an explicit proposed requirement or code change and pass through the normal preview, approval, commit, and validation workflow.

## Consequences

Positive:

- drift is detectable and repairable;
- graph rebuilds are reproducible;
- audit history distinguishes intent, implementation, and evidence;
- parser uncertainty cannot silently redefine the product.

Negative:

- ForgeWeb must maintain stable IDs and manifests;
- reconciliation is required when specification and source disagree;
- graph publication becomes a versioned workflow rather than a simple mutable store.

