# ForgeWeb Product Requirements Document

**Version:** 1.3  
**Status:** Accepted MVP baseline  
**Date:** 2026-08-15  
**Product:** ForgeWeb — AI-Powered Secure Full-Stack Application Generator

## 1. Executive summary

ForgeWeb converts a natural-language product idea into a validated, documented, downloadable full-stack application. It clarifies requirements, creates an approval-ready master specification, recommends a supported technology stack, plans the architecture, generates from secure templates with specialized AI stages, builds a unified Code Review Graph, validates the result in an isolated sandbox, performs bounded repairs, and exports the source with evidence of what passed.

The MVP focuses on secure CRUD and business applications containing authentication, role-based access control, dashboards, REST APIs, and relational data. ForgeWeb itself supports project history, browser editing, external Git synchronization, multiple LLM providers, resumable jobs, per-project isolation, and incremental regeneration.

ForgeWeb promises **secure-by-default generation with automated evidence**, not a guarantee that generated software contains no vulnerabilities.

## 2. Product vision

> Turn an idea into an understandable, editable, secure-by-default application while preserving the relationship between user intent and every generated artifact.

### Product principles

1. **Clarify before generating.** Important ambiguity becomes a question or explicit alternative.
2. **Architecture before code.** Users approve requirements, assumptions, stack, architecture, data model, and security plan.
3. **Templates provide the floor; AI provides adaptation.** Security-critical foundations come from reviewed, versioned templates.
4. **Specification and source are authoritative.** Graphs are derived, checked, and synchronized.
5. **Changes are incremental.** Regenerate the smallest safe dependency closure rather than the entire application.
6. **Security produces evidence.** Builds, tests, dependency checks, secret scans, and findings are visible.
7. **Users retain control.** They can edit code, override choices, inspect progress, and export their work.
8. **Delight must not compromise usability.** Motion supports hierarchy and feedback while respecting performance and reduced-motion preferences.
9. **Disciplined agents, not an autonomous swarm.** Every agent receives a bounded objective, the versioned [ForgeWeb Karpathy Coding Discipline](./architecture/KARPATHY_CODING_DISCIPLINE.md), explicit tools and paths, independent review, and verifiable success criteria.

## 3. MVP goals

- Generate complete CRUD/business web applications from natural-language prompts.
- Support authentication, RBAC, dashboards, relational schemas, REST APIs, validation, and audit-friendly patterns.
- Convert prompts and clarification answers into a versioned master specification.
- Recommend a supported generated-application stack and require approval.
- Generate code using maintained templates plus AI customization.
- Coordinate specialized planning, implementation, review, QA, security, and documentation agents through one provider-neutral task and evidence contract.
- Maintain a unified graph across requirements, decisions, modules, files, symbols, APIs, database entities, controls, tests, and dependencies.
- Use Code Review Graph v2.3.7 for structural source intelligence.
- Maintain ForgeWeb traceability data separately and expose both layers through one Graph API.
- Update a preview graph after debounced saves and create an authoritative graph snapshot for accepted Git commits.
- Execute builds and validation in isolated, resource-limited sandboxes.
- Generate unit, integration, end-to-end, and security tests.
- Attempt bounded repairs and disclose unresolved failures.
- Provide browser editing and explicit external Git synchronization.
- Support platform-managed and bring-your-own-key LLM access.
- Export a validated source ZIP with documentation, a sanitized graph summary, provenance, and security evidence.

## 4. Non-goals

- Reliably generating every possible class of application.
- One-click production deployment in the MVP.
- A hosted live preview in the MVP.
- Mobile-native, desktop-native, game, embedded, or blockchain generation.
- Enterprise compliance certification.
- A complete production-security guarantee.
- Unlimited autonomous repair loops.
- Microservice generation by default.
- Treating Code Review Graph impact predictions as sufficient validation.
- Shipping CRG's SQLite database inside generated ZIPs.
- Enabling cloud or local semantic embeddings in the MVP.
- Redistributing Motion+ or React Bits components in customer-generated applications without suitable licensing.
- Running an unbounded agent swarm, allowing concurrent shared-worktree edits, or treating agent confidence as validation evidence.

## 5. Target users

### Non-technical founder

Wants to turn an operational idea into a prototype without knowing which architecture or security controls to request.

### Student or early-career developer

Wants a complete codebase whose requirements, architecture, security, and tests are documented.

### Professional developer

Wants to accelerate scaffolding while retaining control over code, Git, providers, architecture, and validation.

### Administrator

Manages platform configuration, provider access, policy packs, quotas, audit trails, and health.

## 6. Primary user journey

1. User creates an isolated project and enters an application idea.
2. ForgeWeb extracts actors, workflows, entities, permissions, integrations, and constraints.
3. ForgeWeb asks only material clarification questions and presents alternatives for unclear choices.
4. ForgeWeb creates a structured master specification with explicit assumptions.
5. ForgeWeb recommends a supported stack and proposes architecture, data model, API outline, test plan, and security plan.
6. User approves or edits the proposal.
7. ForgeWeb creates a durable generation job and displays a progress timeline.
8. Versioned templates are instantiated and specialized AI stages implement business-specific behavior.
9. Code Review Graph builds the structural code graph; ForgeWeb builds requirement and provenance mappings.
10. ForgeWeb runs builds, tests, security checks, and graph invariants in isolated runners.
11. ForgeWeb makes a maximum number of bounded repair attempts.
12. User receives documentation, reports, a sanitized graph summary, and the validated source ZIP.
13. Later prompt-based or manual edits trigger preview impact analysis.
14. Accepted changes create a Git commit, authoritative CRG build, unified graph snapshot, and proportional validation run.

## 7. Functional requirements

Priority meanings: **P0** is required for MVP, **P1** follows shortly after, and **P2** is later.

### 7.1 Identity, tenancy, and projects

| ID | Priority | Requirement |
|---|---:|---|
| FR-001 | P0 | Users can register, sign in, sign out, recover access, and manage sessions using a maintained authentication implementation. |
| FR-002 | P0 | Every project has isolated metadata, source workspace, traceability graph, CRG database, credentials, jobs, artifacts, and sandboxes. |
| FR-003 | P0 | Users can create, rename, archive, reopen, and delete projects. |
| FR-004 | P0 | Every accepted material change produces a Git commit and linked unified graph snapshot. |
| FR-005 | P1 | Organizations can assign owner, editor, reviewer, and viewer roles. |

### 7.2 Prompt clarification and specification

| ID | Priority | Requirement |
|---|---:|---|
| FR-010 | P0 | ForgeWeb extracts actors, workflows, entities, permissions, integrations, constraints, and quality attributes from free-form ideas. |
| FR-011 | P0 | The system asks questions only when answers materially alter scope, data, security, or architecture. |
| FR-012 | P0 | The system proposes explicit alternatives when requirements are unclear. |
| FR-013 | P0 | The master specification is runtime-validated structured data rendered as readable prose. |
| FR-014 | P0 | Specification versions, approvals, rejections, and edits are retained. |
| FR-015 | P0 | Generation cannot begin until required sections are approved. |

### 7.3 Stack recommendation and planning

| ID | Priority | Requirement |
|---|---:|---|
| FR-020 | P0 | Stack recommendations consider requirements, supported templates, security policy, maintainability, and user constraints. |
| FR-021 | P0 | Users can accept or change the recommended stack before generation. |
| FR-022 | P0 | Proposals include modules, boundaries, data model, APIs, roles, controls, tests, and deployment instructions. |
| FR-023 | P0 | Only stacks with compatible templates and validation adapters are eligible for generation. |

### 7.4 Generation orchestration

| ID | Priority | Requirement |
|---|---:|---|
| FR-030 | P0 | Generation is a durable, resumable job of idempotent stages. |
| FR-031 | P0 | Users see progress for clarification, planning, generation, graph build, validation, repair, documentation, and packaging. |
| FR-032 | P0 | Security-sensitive foundations come from signed, versioned templates. |
| FR-033 | P0 | Provider routing selects configured models per task with user override. |
| FR-034 | P0 | Failed stages resume from safe checkpoints without repeating completed calls unnecessarily. |
| FR-035 | P0 | Cancellation terminates future work and active sandbox processes safely. |

### 7.5 Unified Code Review Graph

| ID | Priority | Requirement |
|---|---:|---|
| FR-040 | P0 | CRG v2.3.7 supplies structural nodes and edges for files, symbols, imports, calls, inheritance, dependencies, and tests. |
| FR-041 | P0 | ForgeWeb's traceability overlay stores requirements, assumptions, decisions, roles, permissions, controls, tasks, findings, and provenance. |
| FR-042 | P0 | The Graph API presents both layers as one logical graph without requiring one physical database. |
| FR-043 | P0 | A generation manifest maps stable requirement IDs to modules, files, symbols, endpoints, database entities, controls, and tests. |
| FR-044 | P0 | Parsers verify manifest mappings; targeted model analysis is a fallback for ambiguous semantic relationships. |
| FR-045 | P0 | CRG supplies candidate blast radius and affected tests; ForgeWeb validation policy can expand the set. |
| FR-046 | P0 | Debounced saves update a disposable preview graph; accepted commits create authoritative graph artifacts. |
| FR-047 | P0 | Every accepted graph snapshot links specification version, commit, CRG version, graph digest, manifest version, and invariant results. |
| FR-048 | P0 | Ambiguous manual edits require re-analysis and approval before acceptance. |

### 7.6 Editing and versioning

| ID | Priority | Requirement |
|---|---:|---|
| FR-050 | P0 | Users can browse and edit files in a browser editor. |
| FR-051 | P0 | Manual edits produce diffs, preview graph updates, and scoped validation. |
| FR-052 | P0 | Users can connect an external Git repository and explicitly pull or push. |
| FR-053 | P0 | Conflicts never overwrite user code silently. |
| FR-054 | P1 | Users can compare specification, source, structural graph, and traceability changes across versions. |

### 7.7 Validation, repair, and security evidence

| ID | Priority | Requirement |
|---|---:|---|
| FR-060 | P0 | Generated code, CRG parsing, and tests run inside isolated workers with time, CPU, memory, filesystem, process, and network limits. |
| FR-061 | P0 | Validation covers format, lint, types, build, migrations, unit, integration, E2E, dependency, secret, static security, and graph consistency checks. |
| FR-062 | P0 | Repair attempts are limited, auditable, and cannot weaken protected policy merely to pass. |
| FR-063 | P0 | Unresolved failures block validated status. |
| FR-064 | P0 | Findings include severity, affected artifact, evidence, mitigation, status, and tool provenance. |
| FR-065 | P0 | Outcomes distinguish generated, validated, validated-with-warnings, and failed. |

### 7.8 Documentation and export

| ID | Priority | Requirement |
|---|---:|---|
| FR-070 | P0 | Export includes source, lockfiles, migrations, tests, README, setup guide, API docs, architecture summary, and security report. |
| FR-071 | P0 | ZIP construction prevents traversal and excludes credentials, caches, platform-only vendor UI, raw prompts marked private, and `.code-review-graph/graph.db`. |
| FR-072 | P0 | Export includes a sanitized graph summary and provenance manifest rather than CRG's raw SQLite database. |
| FR-073 | P0 | Export provenance links the specification, commit, unified graph snapshot, templates, CRG version, and validation run. |
| FR-074 | P1 | Users can export an SBOM. |

### 7.9 Providers and credentials

| ID | Priority | Requirement |
|---|---:|---|
| FR-080 | P0 | Multiple provider adapters implement a common capability interface. |
| FR-081 | P0 | Users can use platform-managed or encrypted bring-your-own-key credentials. |
| FR-082 | P0 | Raw provider keys are never returned after storage or written to logs, prompts, projects, graph artifacts, or exports. |
| FR-083 | P0 | Routing records provider, model, latency, token use, estimated cost, and outcome. |
| FR-084 | P0 | Context sent to a provider is limited to the approved graph/specification slice required for the task. |

### 7.10 Disciplined multi-agent engineering

| ID | Priority | Requirement |
|---|---:|---|
| FR-090 | P0 | Every generation or material change is decomposed into a typed task DAG with explicit objectives, dependencies, allowed paths/tools, change budgets, acceptance criteria, and validation plans. |
| FR-091 | P0 | All agent roles follow one versioned engineering policy derived from a pinned, reviewed `multica-ai/andrej-karpathy-skills` revision: state material assumptions, prefer the simplest sufficient approach, make surgical changes, investigate failures, and verify observable goals. The policy records its ForgeWeb version, upstream revision, and content digest. |
| FR-092 | P0 | ForgeWeb selects only the specialist roles required by task type and risk; the MVP does not require all roles or parallel agents for every change. |
| FR-093 | P0 | Implementation agents work from immutable base commits in isolated worktrees or overlays and return patch proposals rather than editing a shared worktree. |
| FR-094 | P0 | Parallel implementation is permitted only for disjoint write-path leases; protected/shared files are serialized. |
| FR-095 | P0 | An independent engineering review is required for every accepted code patch; design and security reviews activate through deterministic policy triggers. |
| FR-096 | P0 | Agent completion never implies validated status; only required sandbox checks, graph invariants, provenance gates, and user approvals can accept a change. |
| FR-097 | P0 | CRG and the generation manifest provide bounded context, candidate impact, affected tests, and post-patch scope verification for agent tasks. |
| FR-098 | P0 | Agent attempts, patches, review findings, acceptance evidence, cost, model/provider, policy version, commit, and graph snapshot are auditable without storing private chain-of-thought. |
| FR-099 | P0 | Material ambiguity, scope expansion, protected policy changes, exhausted repair budgets, and unresolved high-risk findings pause for user decision or end honestly as blocked/failed. |

## 8. Generated-application MVP contract

The first supported class is a relational CRUD/business system. A template includes:

- Responsive application shell and dashboard.
- Secure authentication/session integration.
- Owner/admin/member or application-specific RBAC.
- Relational schema, migrations, seeds, and constrained queries.
- Typed REST request/response contracts.
- Server-side authorization for protected operations.
- Input validation, output encoding, secure headers, rate limits, safe password hashing, and safe errors.
- Audit hooks for sensitive actions.
- Unit, integration, E2E, and security regression tests.
- Local container setup and environment documentation.
- A generation manifest connecting stable requirement IDs to artifacts.

## 9. Non-functional requirements

| Area | MVP requirement |
|---|---|
| Security | OWASP-oriented controls, encrypted credentials, least privilege, tenant isolation, auditability, and isolated untrusted-code/CRG execution. |
| Reliability | Durable jobs, idempotent stages, checkpoints, bounded retries, and no silent loss of user code. |
| Performance | Normal platform requests target p95 below 500 ms excluding generation; progress events appear within 2 seconds. |
| Scalability | Stateless web/API where practical; workers scale by queue depth; no premature microservices. |
| Accessibility | Target WCAG 2.2 AA, keyboard navigation, visible focus, semantic status, sufficient contrast, and reduced-motion support. |
| Privacy | Semantic embeddings are disabled in MVP; source remains local to isolated workers except context explicitly sent to selected LLM providers. |
| Observability | Correlated request/job/stage/provider/sandbox/commit/graph identifiers, with secret redaction. |
| Maintainability | Typed contracts, modular boundaries, template/CRG pinning, migrations, ADRs, and automated compatibility tests. |
| Agent quality | Provider-neutral task/result contracts, path leases, bounded attempts, independent review, deterministic gates, and project-scoped sanitized memory. |

## 10. UX and visual direction

ForgeWeb should feel like a serious developer tool with controlled moments of delight.

- Use [Motion for React](https://motion.dev/docs/react-installation) as the primary animation runtime.
- Use [Motion AI Kit](https://motion.dev/ai-kit) as licensed development-time assistance.
- Use selected [Motion UI](https://motion.dev/ui) components for ForgeWeb marketing/product surfaces when licensed.
- Use selected [React Bits](https://reactbits.dev/get-started/index) effects for marketing text, backgrounds, and cards.
- Use a custom React/Motion graph interface for users.
- Retain CRG's existing D3 visualization only for diagnostics and comparison.
- Centralize motion tokens and support `prefers-reduced-motion`.
- Lazy-load heavy canvas/WebGL effects and keep them out of the editor.
- Never allow animation to delay input, hide errors, move focus unexpectedly, or fake progress.

### Licensing boundary

- Motion+/Motion UI and React Bits may be used within the ForgeWeb platform according to their licenses.
- They are not included in generated customer applications by default.
- Generated applications use ForgeWeb-owned templates and redistribution-compatible dependencies.
- Changing this boundary requires written licensing approval and template review.

## 11. Success metrics

- At least 70% of qualified MVP prompts reach an approved specification without administrator intervention.
- At least 60% of qualified generations pass within the configured repair limit during private beta.
- At least 90% of protected generated endpoints have explicit authorization tests.
- 100% of validated exports link specification, commit, CRG artifact, traceability snapshot, validation run, and security report.
- Representative incremental changes reduce model tokens by at least 40% against measured full regeneration.
- Candidate impact precision/recall is measured on ForgeWeb fixtures; CRG marketing benchmarks are not substituted for ForgeWeb results.
- No cross-project file, credential, CRG database, graph, artifact, or sandbox access in testing.
- 100% of accepted agent-written patches link an approved task, independent review, validation evidence, accepted commit, and authoritative graph snapshot.
- No accepted patch exceeds its approved path/change budget without an explicit replan and approval record.

## 12. Release acceptance criteria

1. A user can move from prompt to validated ZIP.
2. Three representative business fixtures generate repeatably.
3. Required approval gates are enforced.
4. Interrupted jobs resume or fail safely.
5. Manual edits update the preview graph and enter ambiguity review when needed.
6. Accepted commits create authoritative structural and traceability snapshots.
7. A failing build or blocking finding cannot be labelled validated.
8. Project, credential, graph-runner, and sandbox isolation tests pass.
9. Export provenance is complete and secrets/raw CRG database are excluded.
10. Accessibility, reduced motion, and UI license checks pass.
11. Agent path/tool isolation, stale-patch rejection, conflicting-write serialization, and bounded-retry tests pass.
12. A representative workflow proves plan → scoped patch → independent review → QA/validation → accepted commit → authoritative graph provenance.

## 13. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Broad prompts exceed template envelope | Misleading output | Qualify prompts, expose support, require approval, and fail honestly. |
| LLM output drifts from approved requirements | Incorrect app | Structured contracts, manifest IDs, traceability edges, and acceptance tests. |
| CRG misses a JavaScript relationship | Incomplete impact set | Treat CRG as candidate analysis; expand via manifests, diffs, dependency rules, and tests. |
| Structural and traceability layers diverge | Unsafe changes | Source/spec authority, digests, invariants, commit-linked snapshots, and rebuild on mismatch. |
| Raw CRG export leaks absolute paths | Privacy leak | Sanitize and normalize paths; never publish raw JSON/SQLite artifacts. |
| Automated repair weakens controls | Vulnerable green build | Immutable policies, bounded repair, diff review, and negative security tests. |
| Untrusted code or parser workload escapes | Platform compromise | Isolated non-root runners, quotas, denied egress, ephemeral workspaces, no platform secrets. |
| Provider cost becomes unpredictable | Budget overrun | Context slicing, routing, caching, checkpoints, and quotas. |
| Vendor UI violates license or performance | Legal/UX risk | Platform-only boundary, inventory/notices, reduced motion, lazy loading, and performance gates. |
| Agents expand scope or over-engineer | Cost, instability, and unwanted behavior | Shared Karpathy-aligned policy, change budgets, protected paths, independent review, and replan on overrun. |
| Parallel agents create conflicting or stale edits | Repository corruption or lost work | Immutable bases, isolated worktrees, disjoint path leases, deterministic merge, and stale-patch rejection. |
| Agent review becomes performative | Defects escape with false confidence | Independent reviewer role, evidence-linked findings, sandbox gates, CRG verification, and no self-certification. |

## 14. Confirmed decisions

- Four-person MVP team and modular-monolith starting point.
- CRUD/business applications first.
- Questions plus approved master specification before generation.
- Template-assisted generation.
- Specification and source are authoritative.
- CRG v2.3.7 is pinned as the structural code-graph engine.
- ForgeWeb traceability overlay remains separate but appears unified to clients.
- Per-project isolated Python graph runner.
- Debounced preview updates and authoritative commit updates.
- Semantic embeddings disabled for MVP.
- Custom React graph UI plus CRG diagnostic visualization.
- Sanitized graph summary in exports; no CRG SQLite database.
- Stable requirement-ID manifest with parser verification.
- Upstream adapter first; fork only when necessary.
- Provider-neutral disciplined multi-agent coordinator inside the existing workflow module.
- gstack is a workflow/quality-gate reference; its runtime is not embedded in generated customer applications.
- `multica-ai/andrej-karpathy-skills` is the explicit coding-discipline source; ForgeWeb pins and translates it into a provider-neutral policy pack without embedding its runtime in generated applications.
- Sequential planner → implementer → reviewer → validator is the MVP baseline; parallel implementation is enabled only after write-lease safety is proven.
