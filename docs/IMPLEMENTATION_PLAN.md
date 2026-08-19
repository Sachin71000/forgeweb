# ForgeWeb Implementation Plan

Status: Accepted planning baseline v1.3  
Date: 2026-08-15  
Related documents: [PRD](./PRD.md), [Architecture](./ARCHITECTURE.md), [CRG assessment](./architecture/CODE_REVIEW_GRAPH_ASSESSMENT.md), [Agent operating model](./architecture/AGENT_OPERATING_MODEL.md), [Karpathy coding discipline](./architecture/KARPATHY_CODING_DISCIPLINE.md)

## 1. Delivery strategy

Build one narrow, trustworthy path before broadening stacks or application types:

> prompt → clarification → approved specification → engineering plan → scoped agent patches → independent review → validation → graph traceability → browser edits → accepted Git commit → sanitized ZIP

The plan assumes a four-person core team:

- one product/full-stack engineer;
- one backend/platform engineer;
- one AI/generation engineer;
- one frontend/design-systems engineer;

with part-time security and product/design review. With this team, the private-beta target is approximately 18 weeks. A smaller team should preserve milestone order and reduce scope rather than running all workstreams simultaneously.

## 2. MVP scope guardrails

The first release supports:

- one ForgeWeb-owned, versioned full-stack template;
- one relational database path;
- secure CRUD and business workflow applications;
- prompt clarification and explicit specification approval;
- one primary generation model plus a provider adapter and fallback;
- managed model credentials and BYOK;
- isolated generation, testing, and structural graph analysis;
- browser file editing and Git synchronization;
- unit, integration, end-to-end, and security validation;
- resumable jobs, bounded automated repairs, and sanitized ZIP export;
- a unified product/code graph with custom React visualization.
- a provider-neutral disciplined multi-agent flow with bounded tasks, isolated patches, independent review, and evidence-backed acceptance.

The MVP excludes:

- one-click production deployment;
- arbitrary infrastructure generation;
- unrestricted package or shell execution;
- collaborative real-time editing;
- semantic code embeddings;
- mobile-native application generation;
- multiple production-grade generated stacks;
- redistribution of Motion UI or React Bits components in generated apps.
- unbounded agent swarms, concurrent shared-worktree edits, or gstack runtime dependencies in generated apps.

## 3. Milestone map

| Milestone | Weeks | Primary outcome |
| --- | ---: | --- |
| M0 — Foundation and risk spikes | 1–2 | Running workspace, contracts, first template, CRG proof |
| M1 — Identity and project control plane | 3–4 | Secure project and credential lifecycle |
| M2 — Prompt-to-specification workflow | 5–6 | Approved, versioned master specification |
| M3 — Graph foundation | 5–8 | Isolated CRG adapter and unified graph API |
| M4 — Generation and agent engine | 7–10 | Reproducible template-assisted generation through bounded specialist roles |
| M5 — Sandbox validation and repair | 11–13 | Evidence-backed build/test/security gate |
| M6 — Editor, Git, graph UI, and export | 12–15 | Complete user workflow and deliverable ZIP |
| M7 — Product experience and motion | 14–16 | Polished, accessible interaction system |
| M8 — Hardening and private beta | 17–18 | Operable, auditable beta release |

M3 runs partly in parallel with M2 and M4. M6 begins when repository and graph contracts stabilize. Security, accessibility, observability, and testing are continuous workstreams rather than end-of-project phases.

## 4. M0 — Foundation and risk spikes

Duration: Weeks 1–2

### Deliverables

- Initialize the TypeScript monorepo and dependency boundaries.
- Add web, API, worker, shared contracts, template, and graph-adapter packages.
- Establish local Postgres, Redis, object storage emulator, and isolated runner development flow.
- Define environment, secrets, structured logging, error, and audit-event conventions.
- Select and pin the first generated application stack.
- Create the smallest ForgeWeb-owned secure CRUD template.
- Define stable IDs for requirements, generation operations, graph nodes, and validation runs.
- Implement a vertical job skeleton: enqueue, execute, report progress, retry, cancel, and resume.
- Complete the CRG exit-criteria spike using v2.3.7.
- Write threat models for the control plane, generation sandbox, BYOK handling, and ZIP export.
- Establish CI for lint, types, unit tests, migrations, secret scanning, dependency audit, and build.

### CRG spike tasks

- Build a pinned Python graph-runner image with embeddings disabled.
- Analyze the reference template through a minimal adapter.
- Save and restore the private SQLite artifact.
- Verify incremental/full normalized graph convergence.
- Produce repository-relative sanitized JSON.
- Join at least one requirement to a file, symbol, route, test, and validation result.
- Prove network denial and project workspace isolation.
- Simulate a runner crash and confirm the previous accepted snapshot remains intact.

### Exit gate

- A developer can submit a sample job and observe durable progress.
- The template builds and tests deterministically.
- The CRG assessment's six spike exit criteria pass.
- Critical threat-model findings have owners and planned controls.
- Architecture decision records are accepted.

## 5. M1 — Identity and project control plane

Duration: Weeks 3–4

### Deliverables

- User sign-in, session management, logout, and account recovery.
- User/project authorization checks on every API and job boundary.
- Project create, list, open, archive, and delete workflows.
- Project roles sufficient for the MVP, even if the UI initially assumes one owner.
- Encrypted provider credential storage with per-user ownership.
- BYOK add, verify, rotate, revoke, and redacted-display flows.
- Project event history and immutable audit events.
- Database migrations, backup/restore procedure, and retention rules.
- Rate limits and abuse controls for authentication and job creation.

### Exit gate

- Cross-user and cross-project authorization tests pass.
- Plaintext provider keys never appear in database reads, logs, traces, or API responses.
- A deleted or revoked credential cannot start new model work.
- Project deletion has an explicit asynchronous cleanup state and audit trail.

## 6. M2 — Prompt-to-specification workflow

Duration: Weeks 5–6

### Deliverables

- Initial idea submission with examples and scope guidance.
- Clarification engine that asks simple, decision-oriented questions before generation.
- Question formats supporting recommended options and conditional follow-ups.
- A structured master-specification schema covering:
  - product summary and goals;
  - users and roles;
  - functional requirements;
  - data entities and relationships;
  - pages and primary journeys;
  - API and integration needs;
  - authorization and security rules;
  - non-functional requirements;
  - selected stack and rationale;
  - explicit assumptions, exclusions, and open risks.
- Stable requirement IDs that survive revisions where intent is unchanged.
- Draft, review, approve, supersede, and history states.
- Specification difference viewer and approval confirmation.
- Stack recommendation with user approval rather than silent selection.

### Exit gate

- A target CRUD application can be specified without hidden developer decisions.
- The schema rejects incomplete role, ownership, destructive-action, and data-sensitivity requirements.
- No generation job can start from an unapproved specification version.
- Revising an approved specification creates a new version and preserves the prior one.

## 7. M3 — Graph foundation

Duration: Weeks 5–8

### Deliverables

#### Structural graph adapter

- Implement `CodeGraphAdapter` with build, update, impact, diff, and health operations.
- Pin CRG v2.3.7 and record its version in every artifact.
- Start one isolated, short-lived runner for each project graph job.
- Pass an explicit repository root and verify the runner's project identity.
- Support private restore/publication of incremental SQLite artifacts.
- Add preview and authoritative graph modes.
- Disable all external embedding providers.
- Normalize CRG node and relationship types into a versioned ForgeWeb schema.
- Sanitize paths and reject symlink or path traversal escapes.

#### Traceability overlay

- Model requirement, decision, role, API contract, data entity, security control, generation operation, validation result, and Git commit nodes.
- Define typed traceability edges such as:
  - `SATISFIED_BY`;
  - `GENERATED_BY`;
  - `VALIDATED_BY`;
  - `PROTECTS`;
  - `IMPLEMENTS_ROLE`;
  - `EXPOSES_API`;
  - `PERSISTS_ENTITY`;
  - `SNAPSHOT_OF`.
- Add source and confidence metadata to every edge.
- Implement reconciliation between generation-manifest declarations and parser-confirmed structure.

#### Unified graph service

- Build project snapshot, neighborhood, path, search, impact, diff, and provenance APIs.
- Scope every query by project and authorized user.
- Store immutable authoritative snapshots and replaceable preview snapshots.
- Expose partial/degraded states without presenting stale results as current.
- Add golden repositories and schema/upgrade contract tests.

### Exit gate

- A requirement-to-code-to-test-to-validation path is queryable.
- Accepted commits create immutable, reproducible graph snapshots.
- Full and incremental processing converge for golden repositories.
- A project cannot query or infer another project's node IDs, paths, or artifacts.
- Graph degradation does not block source access and is clearly reported.

## 8. M4 — Generation and agent engine

Duration: Weeks 7–10

### Deliverables

- Provider-neutral model gateway with timeout, retry, usage, and redaction controls.
- Prompt and response schema versioning.
- Deterministic generation planner that converts approved requirements into typed operations.
- ForgeWeb-owned application template registry with version pinning.
- Template selection rules and compatibility validation.
- File-operation engine with allowlisted paths and atomic changes.
- Generation manifest mapping each operation to requirements and written files.
- Dependency allowlist, lockfile policy, and package risk checks.
- Git repository initialization and an immutable initial generated commit.
- Idempotency keys for generation phases and resumable checkpoints.
- Streamed job progress with user-readable stages rather than raw model reasoning.
- Cost, token, duration, and failure telemetry by phase and provider.
- Versioned `AgentPolicyPack`, `AgentTask`, `AgentResult`, review, and acceptance-evidence schemas.
- Pin a reviewed `multica-ai/andrej-karpathy-skills` commit and digest; translate its four principles into provider-neutral task fields, gates, reviewer checks, and golden policy-conformance fixtures.
- Engineering planner that emits a typed task DAG with dependencies, risk, path/tool scopes, change budgets, success criteria, and validation steps.
- Sequential planner → implementation agent → independent reviewer → sandbox validator baseline.
- Isolated worktree/overlay patch proposals with immutable base commits and deterministic merge preconditions.
- Protected-path policy for shared contracts, migrations, authentication, authorization, dependencies, and global configuration.
- Conditional product, design, test, and security specialist activation.
- CRG-assisted context slicing, post-patch scope verification, candidate affected tests, and policy-based impact expansion.
- Bounded task attempts, explicit `NEEDS_CONTEXT`/`BLOCKED` outcomes, and no private chain-of-thought persistence.

### Generation phases

1. Validate the approved specification.
2. Choose and pin the template and stack.
3. Produce an engineering-reviewed implementation plan and typed task DAG.
4. Lease bounded tasks to the minimum required specialist roles.
5. Generate isolated patch proposals for data, domain, API, UI, tests, and documentation as needed.
6. Deterministically merge non-stale, policy-compliant patches.
7. Build the preview graph and verify declared scope/impact.
8. Run independent engineering review plus conditional design/security review.
9. Validate in the sandbox and enter bounded focused repair when permitted.
10. Commit, build the authoritative graph, document, and package.

### Exit gate

- The same approved spec, template version, and generation configuration yield structurally comparable repositories.
- Every written file appears in the generation manifest.
- Every requirement is implemented, explicitly deferred, or reported unmet.
- Interrupted generation resumes without duplicating operations or corrupting the repository.
- The model cannot write outside the project workspace or execute an unapproved tool.
- Every accepted patch links to one task, immutable base, diff digest, independent review, acceptance evidence, commit, and authoritative graph snapshot.
- Overlapping write leases, stale patches, scope overruns, self-approval, and attempts to weaken protected tests/policies fail closed.
- Low-risk work proves the sequential baseline; parallel implementation remains disabled until disjoint path leases and conflict tests pass.

## 9. M5 — Sandbox validation and repair

Duration: Weeks 11–13

### Deliverables

- Ephemeral sandbox image for the first generated stack.
- Network disabled by default with explicit, temporary allowlisting only for controlled dependency restoration.
- CPU, memory, process, disk, output, and wall-clock limits.
- Read-only base image and project-scoped writable workspace.
- Build, type-check, lint, migration, unit, integration, end-to-end, dependency, secret, and static security checks.
- Machine-readable validation evidence and a user-readable security report.
- Severity policy that distinguishes release blockers from warnings.
- Bounded repair orchestrator with failure classification and changed-file budget.
- Revalidation of affected checks plus a final complete authoritative pass.
- Quarantine and evidence retention for suspicious output.
- Software bill of materials and dependency-license inventory for exports.

### Repair policy

- Maximum attempts and token/cost budget are fixed per job.
- A repair receives the approved spec, relevant source, focused diagnostics, graph impact candidates, and prior attempt history.
- The repair cannot modify the approved specification.
- Security controls, authentication, authorization, migrations, and dependency changes receive stricter review and complete revalidation.
- On exhaustion, ForgeWeb preserves the best safe revision and gives a specific failure report; it never labels the project successful.

### Exit gate

- A successful project passes the complete release validation policy.
- Intentionally vulnerable fixtures are detected at the expected severity.
- Sandbox escape, fork bomb, secret-exfiltration, and path-traversal tests fail safely.
- Repairs stop at their configured bounds and preserve complete audit history.
- The security report states evidence and limitations without making an absolute security guarantee.

## 10. M6 — Editor, Git, graph UI, and export

Duration: Weeks 12–15

### Deliverables

#### Browser workspace

- File tree, code editor, search, diagnostics, diff, and validation panels.
- Save states: local edit, preview analysis, accepted commit, and validation status.
- Prompt-based change request that creates a plan and proposed patch.
- Manual edits without losing requirement and generation provenance.
- Conflict-safe saves using file revision or commit preconditions.

#### Git lifecycle

- Project branch and commit model.
- User acceptance action that creates an immutable commit.
- Commit-to-specification and commit-to-graph-snapshot linkage.
- External Git remote connection with least-privilege credential handling.
- Push status, failure recovery, and clear conflict reporting.

#### Unified graph interface

- Custom React graph experience, not the raw CRG D3 view.
- Search, filter, neighborhood expansion, path tracing, and impact highlighting.
- Distinguish requirements, code, tests, controls, evidence, and commits visually.
- Display source/confidence and provisional/authoritative state.
- Provide a synchronized detail panel and links into the editor.
- Keep CRG's built-in visualization available only as an internal diagnostic.

#### Export

- Export the accepted, fully validated Git commit only.
- Create a deterministic ZIP with source, lockfiles, migrations, tests, README, environment example, security report, SBOM, and sanitized provenance summary.
- Exclude provider keys, secrets, sandbox caches, `.git`, raw prompts where sensitive, CRG SQLite, absolute paths, and internal service metadata.
- Verify archive entries against traversal, symlink, size, secret, and allowlist policies before release.

### Exit gate

- A user can safely edit, review, accept, validate, graph, and export a generated project.
- Stale browser writes are rejected or merged explicitly.
- The graph always indicates which Git commit and spec version it represents.
- ZIP extraction tests pass on Windows, macOS, and Linux.
- Export leakage fixtures find no credentials, absolute local paths, or private CRG artifacts.

## 11. M7 — Product experience and motion

Duration: Weeks 14–16

### Design direction

ForgeWeb should feel like an engineering instrument: confident, high-signal, and alive during long-running work. Animation explains changes and relationships; it does not decorate uncertainty or hide waiting.

### Deliverables

- ForgeWeb design tokens for color, type, space, radius, elevation, motion, and graph semantics.
- Responsive application shell and consistent empty, loading, degraded, error, and success states.
- Generation timeline with resumable state and stage-specific evidence.
- Specification review transitions that preserve reading position and diff context.
- Graph node expansion, traversal, and impact animations.
- Editor/graph cross-navigation transitions.
- Tastefully selected Motion UI and React Bits components in platform-owned screens.
- Component provenance inventory and license record.
- Reduced-motion equivalents for every non-trivial animation.
- Full keyboard graph navigation or an equivalent accessible list/tree representation.
- Performance budgets for initial load, editor readiness, graph interaction, and animation frame rate.

### Component boundary

- Platform UI may use reviewed, licensed Motion UI and React Bits components.
- Generated applications use ForgeWeb-owned components by default.
- No third-party showcase component is copied into customer output without individual redistribution review.
- Any component with unclear provenance or incompatible terms is replaced before beta.

### Exit gate

- Core workflows meet WCAG 2.2 AA acceptance checks.
- Reduced-motion mode preserves meaning and usability.
- The graph remains usable with thousands of nodes through aggregation, filtering, and progressive expansion.
- Motion does not delay approvals, obscure failures, or interfere with keyboard/screen-reader operation.

## 12. M8 — Hardening and private beta

Duration: Weeks 17–18

### Deliverables

- End-to-end load and soak tests for concurrent generation and graph jobs.
- Queue fairness, user quotas, backpressure, and provider outage behavior.
- Backup restoration and project artifact disaster-recovery exercise.
- Security review of authorization, BYOK, sandboxes, exports, and Git integration.
- Dependency and container image pinning review.
- Operational dashboards, alerts, runbooks, and support diagnostics.
- Data retention/deletion verification.
- Product analytics for funnel stages without collecting source code or secrets.
- Beta onboarding, sample prompts, limitations, and feedback mechanism.
- Incident response and vulnerability disclosure processes.

### Private-beta release gate

- No open critical or high security defect.
- Release success criteria in the PRD are automated and enforced.
- Restore, retry, cancel, and provider-outage drills pass.
- Every user-visible success state has matching persisted evidence.
- Known analysis limitations are documented in the UI and export report.
- Support staff can diagnose a failed job using IDs and redacted evidence without accessing user secrets.

## 13. Continuous workstreams

### 13.1 Security

- Threat-model changes to trust boundaries.
- Deny by default at authorization, sandbox, network, and export boundaries.
- Scan source, containers, dependencies, infrastructure, and generated projects.
- Maintain malicious prompt and repository fixtures.
- Track security exceptions with owner and expiry.

### 13.2 Quality

- Unit tests for domain policies and adapters.
- Integration tests for Postgres, queues, artifacts, providers, Git, and runners.
- Contract tests for model schemas, templates, CRG normalization, and exports.
- End-to-end tests for the complete golden user journey.
- Mutation or property-based tests for authorization, path handling, and manifest reconciliation where valuable.
- Golden agent workflows for low-risk, UI, migration/auth, stale-patch, conflict, blocked, and bounded-repair scenarios.
- Policy-conformance fixtures for material ambiguity, speculative abstraction, unrelated cleanup, budget overrun, test weakening, missing evidence, and repeated unchanged repair attempts.
- Measure unnecessary-code rate, scope rejections, cross-agent conflicts, first-pass acceptance, review escapes, and traceability completeness.

### 13.3 Observability and cost

- Propagate correlation IDs across API, queue, runner, graph, validation, and export operations.
- Measure queue delay, stage duration, retries, failure class, token usage, and artifact size.
- Never record provider keys, session secrets, full source files, or unnecessary prompt contents.
- Alert on cross-project identity mismatch, sandbox policy violations, unexpected network access, and export leakage rejection.

### 13.4 Accessibility and performance

- Include accessibility checks in component and end-to-end CI.
- Test keyboard-only and screen-reader flows for all consequential actions.
- Track web vitals, editor readiness, graph query latency, and large-project behavior.
- Offer reduced data/animation behavior when system preferences or device constraints require it.

## 14. Initial epic backlog

| Epic | Key result | Depends on |
| --- | --- | --- |
| EP-01 Project identity and authorization | Every resource and job is tenant-scoped | M0 |
| EP-02 Specification compiler | Approved structured spec with stable IDs | EP-01 |
| EP-03 Template registry | Versioned secure application skeleton | M0 |
| EP-04 Generation planner | Typed operations and complete manifest | EP-02, EP-03 |
| EP-05 Durable orchestration | Resumable, cancellable, idempotent jobs | M0 |
| EP-06 Sandbox execution | Isolated builds and test evidence | EP-05 |
| EP-07 Security validation and repair | Bounded remediation and honest report | EP-04, EP-06 |
| EP-08 CRG adapter | Safe structural graph artifacts | M0 |
| EP-09 Traceability overlay | Intent-to-code-to-evidence links | EP-02, EP-04, EP-08 |
| EP-10 Browser workspace | Manual and prompt-based change workflow | EP-04 |
| EP-11 Git lifecycle | Accepted commits and external sync | EP-10 |
| EP-12 Unified graph UI | Explainable navigation and impact | EP-09, EP-11 |
| EP-13 Sanitized export | Validated, reproducible customer package | EP-07, EP-11 |
| EP-14 Platform design system | Distinctive and accessible interface | M0 |
| EP-15 Operations and beta | Reliable, observable service | All MVP epics |
| EP-16 Disciplined agent coordinator | Bounded provider-neutral tasks, isolated patches, independent review, and evidence-backed acceptance | EP-02, EP-04, EP-05, EP-08 |

## 15. Definition of done

A product story is complete only when:

- acceptance behavior is automated at the correct test layer;
- project and user authorization are enforced server-side;
- failure, cancellation, retry, and stale-state behavior are defined;
- logs and metrics are useful and redacted;
- accessibility and responsive states are covered for UI changes;
- data migration and rollback implications are documented;
- security and threat-boundary changes are reviewed;
- API and event contracts are versioned when needed;
- the related requirement, code, tests, and evidence appear in the unified graph;
- documentation and operational runbooks are updated.
- agent tasks record assumptions, scopes, budgets, criteria, attempts, patch digests, independent reviews, and acceptance evidence;
- the active agent policy records its ForgeWeb version, reviewed upstream revision/digest, behavioral conformance results, and explicit assumptions, preserved behavior, simplest sufficient approach, and validation plan;
- no implementation agent self-approves and no patch bypasses required graph/validation gates.

## 16. Decisions required before M0 closes

The architecture remains stable, but implementation needs these concrete selections:

1. First generated stack versions: recommended default is Next.js/TypeScript, Postgres, an ORM with migration support, and a ForgeWeb-owned component system.
2. Control-plane hosting and region for the private beta.
3. Primary and fallback model providers, with their retention and data-use settings.
4. Object storage and isolated-runner platform.
5. Authentication provider versus first-party session implementation.
6. Motion UI/Motion+ license tier and the exact React Bits components approved for platform use.
7. Private-beta user count, job quotas, artifact retention, and cost ceiling.

These are bounded implementation choices. They do not require reopening the confirmed product workflow or CRG integration architecture.

## 17. First twelve engineering tickets

1. Create monorepo packages and enforce module dependency boundaries.
2. Define project, specification, job, artifact, graph, and audit schemas.
3. Implement durable job lifecycle with idempotency and progress events.
4. Create the first secure CRUD template and golden specification.
5. Build the pinned CRG runner image and minimal `CodeGraphAdapter`.
6. Add normalized graph schema, sanitization, and golden snapshots.
7. Implement project authorization and encrypted provider credentials.
8. Implement specification schema, versioning, and approval gate.
9. Create generation-operation and manifest contracts.
10. Complete sandbox and BYOK threat-model control tests.
11. Implement the pinned Karpathy-derived agent policy plus task/result schemas, policy-conformance fixtures, task states, path leases, and stale-patch rejection.
12. Prove one sequential planner → implementer → reviewer → validator workflow with CRG scope verification and complete provenance.

Completing these tickets validates the architecture's highest-risk boundaries before the team invests in the full visual experience.
