# ADR-006: Use disciplined, provider-neutral multi-agent orchestration

Status: Accepted  
Date: 2026-08-15

## Context

ForgeWeb must turn an approved specification into secure, tested source across planning, application code, tests, graph reconciliation, review, repair, documentation, and export. A single unconstrained agent has too much context, too many tools, and an incentive to accept its own work. An unrestricted swarm adds coordination cost, conflicting edits, inconsistent assumptions, and difficult provenance.

The product should adopt the useful specialist lifecycle demonstrated by [`garrytan/gstack`](https://github.com/garrytan/gstack) and the shared coding discipline defined by [`multica-ai/andrej-karpathy-skills`](https://github.com/multica-ai/andrej-karpathy-skills): think before coding, prefer simplicity, make surgical changes, and verify explicit goals.

## Options considered

| Option | Benefits | Costs | Decision |
|---|---|---|---|
| One general agent | Simplest runtime and handoff model | Large context, weak independence, self-review risk | Rejected |
| Unrestricted autonomous swarm | Maximum apparent parallelism | Conflicts, cost, emergent scope, weak auditability | Rejected |
| Vendor gstack directly as product runtime | Reuses mature workflows | Claude/Bun/global-state coupling; product contract follows upstream | Rejected |
| Provider-neutral coordinator with bounded specialist roles | Clear scope, independent gates, portable contracts, selective parallelism | Requires task/patch/review orchestration | Accepted |

## Decision

Implement a provider-neutral agent coordinator inside ForgeWeb's existing workflow module. It creates a typed task DAG and selects only the roles required by risk and change type.

All agents must use versioned `AgentTask`, `AgentResult`, tool-policy, and evidence contracts. Implementation agents work in isolated worktrees or overlay filesystems and return patch proposals. They do not edit a shared worktree directly. Parallel implementation requires disjoint path leases. Engineering review is independent and mandatory; design and security review are policy-triggered. Sandbox checks and graph invariants—not agent confidence—determine validated status.

Adopt gstack's staged role concepts and review-readiness model as design references, but do not copy its runtime into generated projects or make core behavior depend on user-level gstack configuration.

Adopt the Karpathy guidelines as a versioned policy source, not an unpinned runtime dependency. Each ForgeWeb `AgentPolicyPack` records the reviewed upstream commit and content digest. Upstream changes require explicit review and policy-conformance regression tests; they cannot alter active runs automatically. The normative translation is [ForgeWeb Karpathy Coding Discipline](../KARPATHY_CODING_DISCIPLINE.md).

## Rationale

1. Specialized contexts reduce irrelevant tokens while making responsibilities explicit.
2. Typed scopes and change budgets enforce surgical edits.
3. Independent review prevents implementation agents from certifying themselves.
4. Selective role activation captures gstack's quality benefits without paying swarm cost on every task.
5. Provider-neutral contracts preserve the existing multi-provider architecture.
6. Patch isolation and CRG impact checks make parallelism safe enough to add incrementally.

## Trade-offs accepted

- Coordination, patch application, and evidence storage add implementation work.
- Some tasks will be slower because review and validation are explicit gates.
- Provider-specific gstack features are not automatically available in the product.
- Parallelism is deliberately limited until path leases and stale-patch handling are proven.

## Consequences

Positive:

- every accepted change has a bounded objective and complete provenance;
- task context is smaller and project-scoped;
- review, QA, and security roles remain independent;
- agents can be swapped across providers without changing domain contracts;
- CRG can verify declared scope and select affected tests.

Negative:

- the coordinator becomes a critical correctness component;
- task decomposition quality affects cost and result quality;
- incorrect path scopes can block legitimate work or miss dependencies;
- policy packs and role prompts require versioning and evaluation.

Mitigations:

- begin sequentially with planner, implementer, reviewer, and validator;
- use generation manifests and CRG impact as candidate scope, then risk-expand deterministically;
- maintain golden workflows, adversarial fixtures, and provider contract tests;
- require human approval for scope, architecture, security policy, and unresolved high-risk ambiguity.

## Revisit triggers

Revisit when:

- one-agent execution matches multi-agent quality at materially lower cost;
- task conflicts exceed the agreed threshold despite path leases;
- a standard agent protocol safely replaces ForgeWeb contracts;
- a gstack runtime integration becomes provider-neutral and offers verified value beyond the adapter approach;
- observed scale justifies extracting the coordinator from the modular monolith.
