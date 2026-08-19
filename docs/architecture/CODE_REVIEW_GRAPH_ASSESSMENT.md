# Code Review Graph Integration Assessment

Status: Accepted with conditions  
Date: 2026-08-15  
Repository assessed: [tirth8205/code-review-graph](https://github.com/tirth8205/code-review-graph)

## 1. Executive decision

ForgeWeb will adopt Code Review Graph (CRG) v2.3.7 as its pinned structural-code analysis engine. CRG will not be treated as ForgeWeb's complete product graph or as an infallible source of change impact.

The product will expose one graph experience backed by two layers:

1. CRG structural layer: files, symbols, imports, calls, inheritance, tests, references, dependencies, and structural communities.
2. ForgeWeb traceability overlay: requirements, decisions, user roles, API contracts, database entities, security controls, validation evidence, generation operations, and Git commits.

The approved integration boundary is a ForgeWeb-owned adapter. The application must never depend directly on CRG's internal database schema or expose its raw SQLite database to end users.

## 2. Why CRG is a good fit

| ForgeWeb need | CRG capability | Decision |
| --- | --- | --- |
| Parse generated repositories | Tree-sitter-based multi-language structural analysis | Reuse |
| Keep analysis current | File hashing, incremental updates, watch support | Reuse behind ForgeWeb triggers |
| Find candidate blast radius | Dependency traversal and impact analysis | Reuse as advisory evidence |
| Connect tests and implementation | `TESTED_BY` and other structural relationships | Reuse and enrich |
| Query code structure | CLI, Python API, MCP tools, JSON/GraphML exports | Wrap in adapter |
| Visual diagnostics | Built-in D3 visualization | Developer diagnostic only |
| Product traceability | Not a CRG responsibility | Build in ForgeWeb overlay |
| Multi-tenant isolation | Local repository-oriented design | Add isolated per-project runner |
| Customer-safe export | Raw results can contain local paths | Sanitize and project |

CRG provides a substantial head start on structural analysis while allowing ForgeWeb to concentrate on specification traceability, generation provenance, security evidence, and the user workflow.

## 3. Repository evidence

The following characteristics were confirmed from the repository and release materials:

- Current adoption target: v2.3.7, with Python 3.10 or newer.
- License: MIT.
- Project maturity is marked beta; upgrades therefore require compatibility tests rather than automatic version drift.
- The local graph store is SQLite under `.code-review-graph/graph.db`.
- Core analysis uses Tree-sitter through `tree-sitter-language-pack` and models files, symbols, types, tests, and code relationships.
- Incremental processing uses file-content hashes and supports dependent-file reprocessing.
- The project provides CLI, MCP, watch, graph query, impact, diff, export, and visualization capabilities.
- Normal graph operation is local. Optional cloud-backed embedding features exist, but ForgeWeb will disable them in the MVP.
- CRG's own evaluation notes that impact and flow analysis are useful but imperfect. These results justify using its output as a candidate set and explanatory signal—not as the sole validation authority.

Primary references:

- [Repository and documentation](https://github.com/tirth8205/code-review-graph)
- [v2.3.7 release](https://github.com/tirth8205/code-review-graph/releases/tag/v2.3.7)
- [Package metadata](https://github.com/tirth8205/code-review-graph/blob/main/pyproject.toml)
- [Security policy](https://github.com/tirth8205/code-review-graph/blob/main/SECURITY.md)
- [Benchmark documentation](https://github.com/tirth8205/code-review-graph/tree/main/benchmarks)

## 4. Important gaps and limitations

### 4.1 Product semantics

CRG understands code structure, not the complete intent behind a generated application. It does not natively represent:

- approved requirement IDs;
- clarification answers and architecture decisions;
- user roles and authorization intent;
- security controls and threat mitigations;
- generation operations and prompt provenance;
- validation runs and evidence artifacts;
- accepted Git commits as product milestones.

These belong in ForgeWeb's Postgres-backed traceability overlay.

### 4.2 Analysis confidence

Static analysis cannot perfectly resolve dynamic imports, reflection, runtime dependency injection, generated routes, framework conventions, or string-based references. CRG's own benchmarks document limitations in impact ranking and flow detection, with some language and framework combinations weaker than others.

ForgeWeb must therefore label relationships by evidence source and confidence:

- `parser-confirmed`: directly extracted by CRG;
- `generator-declared`: emitted by the ForgeWeb generation manifest;
- `runtime-confirmed`: observed in test or sandbox evidence;
- `heuristic`: inferred from naming, community, or impact analysis;
- `user-confirmed`: approved or corrected by the user.

No destructive refactor, security conclusion, or release decision may depend only on a heuristic edge.

### 4.3 Service and tenancy model

CRG is designed around a local repository and local SQLite graph. A shared long-running graph server would create repository-root ambiguity, concurrency risk, cross-project leakage risk, and difficult lifecycle management.

ForgeWeb will run one short-lived CRG worker per project job. The worker receives an explicit repository root and a project-scoped workspace, then exits after publishing sanitized artifacts.

### 4.4 Export safety

Raw graph data can include absolute local filesystem paths and implementation details. ForgeWeb will never place the raw SQLite database or unsanitized CRG export in a customer ZIP.

User-facing output will include:

- repository-relative paths only;
- stable ForgeWeb node IDs;
- normalized node and edge types;
- evidence source and confidence;
- the accepted Git commit SHA;
- CRG and adapter versions;
- graph build timestamp and result status.

## 5. Approved integration design

### 5.1 Versioning and ownership

- Pin `code-review-graph==2.3.7` in the graph-runner image.
- Access CRG only through `CodeGraphAdapter`.
- Keep ForgeWeb's normalized graph schema versioned independently.
- Upgrade CRG only after golden-repository contract tests pass.
- Maintain an upstream fork only if a required fix cannot reasonably be contributed or isolated in the adapter.

### 5.2 Runner lifecycle

For each graph build:

1. Materialize the requested Git commit into a project-scoped temporary workspace.
2. Restore the prior project CRG SQLite artifact when an incremental update is valid.
3. Start an isolated Python runner with an explicit repository root, network disabled, CPU/memory/time limits, and embeddings disabled.
4. Run the appropriate preview or authoritative graph update.
5. Export the structural projection through the adapter.
6. Sanitize paths and reject nodes outside the materialized repository.
7. Store the new SQLite artifact privately for the next incremental update.
8. Join the structural projection with the ForgeWeb overlay.
9. Publish a versioned unified-graph snapshot and validation evidence.
10. Destroy the temporary workspace and runner.

### 5.3 Preview and authoritative modes

Preview mode is optimized for editor feedback:

- triggered after a debounce interval;
- analyzes changed files and bounded dependents;
- may be cancelled and superseded;
- clearly marked provisional;
- cannot become release evidence.

Authoritative mode is tied to an accepted Git commit:

- analyzes the exact committed tree;
- runs the full configured post-processing pipeline;
- produces immutable graph and validation artifacts;
- becomes the graph snapshot referenced by project history and export provenance.

### 5.4 Embeddings

Embeddings are disabled for the MVP. Search uses structural graph queries, deterministic indexes, and Postgres full-text search. This prevents accidental code disclosure to an external embedding provider and reduces cost, configuration, and tenancy complexity.

Semantic search can be considered later behind an explicit privacy setting, provider allowlist, data-retention contract, and per-project audit trail.

## 6. Adapter contract

The adapter must provide a stable interface independent of CRG internals:

```ts
interface CodeGraphAdapter {
  build(input: GraphBuildInput): Promise<StructuralGraphArtifact>;
  update(input: GraphUpdateInput): Promise<StructuralGraphArtifact>;
  impact(input: ImpactQuery): Promise<ImpactCandidateSet>;
  diff(input: GraphDiffInput): Promise<StructuralGraphDiff>;
  health(): Promise<AdapterHealth>;
}
```

Every structural artifact must include:

- `projectId` and `jobId`;
- accepted or preview source revision;
- `crgVersion`, `adapterVersion`, and `schemaVersion`;
- normalized repository-relative nodes and edges;
- warnings, unsupported constructs, and partial-analysis indicators;
- start/end timestamps and reproducibility metadata.

The adapter must fail closed if it detects an absolute path escape, an unexpected repository root, a schema incompatibility, or a project-identity mismatch.

## 7. Verification plan

### 7.1 Golden repositories

Maintain small fixtures covering the first supported generated stack and these relationships:

- file imports;
- function and method calls;
- class inheritance and interface implementation;
- route-to-service-to-database flow;
- tests linked to implementation;
- renamed and deleted symbols;
- dynamic/framework behavior that should produce explicit warnings.

Store expected normalized snapshots, not CRG's raw SQLite representation.

### 7.2 Contract gates

A CRG or adapter update is accepted only when:

- all golden snapshots have been reviewed;
- no cross-project paths or identifiers appear;
- incremental and full builds converge on equivalent normalized graphs;
- malformed repositories fail safely;
- graph failures do not corrupt the previous accepted snapshot;
- performance remains within agreed budgets;
- the customer export remains sanitized.

### 7.3 Product validation

The unified graph must also be checked against the ForgeWeb generation manifest. Every generated file must map to at least one generation operation, and every approved requirement must be either implemented by mapped artifacts or explicitly reported as unmet.

## 8. Risk register

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Parser misses dynamic relationships | Medium | Medium | Manifest and runtime evidence; confidence labels |
| Upstream breaking change | Medium | High | Exact pin, adapter, golden contract suite |
| Cross-project data leakage | Low | Critical | Isolated runners, scoped workspaces, identity checks |
| Absolute path exposed in export | Medium | High | Sanitizer, export allowlist, automated leakage tests |
| SQLite artifact corruption | Low | Medium | Immutable prior artifact, atomic artifact publication, rebuild fallback |
| Preview graph becomes stale | Medium | Medium | Revision IDs, cancellation, authoritative commit build |
| CRG analysis over-trusted | Medium | High | Candidate-only impact semantics, evidence labels, multi-signal validation |
| Graph processing slows generation | Medium | Medium | Incremental preview, async jobs, bounded timeouts, progress reporting |

## 9. Exit criteria for the CRG spike

CRG integration may move from spike to core implementation when:

1. A generated reference application can be built, updated, and diffed through the adapter.
2. Full and incremental results converge for the golden repository.
3. A requirement-to-file-to-symbol-to-test path is visible in the unified graph.
4. The runner demonstrates project isolation and network denial.
5. Export leakage tests confirm no absolute path, key, credential, or raw SQLite artifact is included.
6. An upstream CRG failure leaves the prior accepted graph usable and reports a clear degraded state.

## 10. Final assessment

CRG is a strong component choice because it solves the difficult structural parsing and relationship-extraction layer without dictating ForgeWeb's product model. The adoption remains low-risk only if ForgeWeb owns the isolation boundary, normalized schema, provenance model, and validation policy. Those conditions are mandatory architecture—not optional hardening work.
