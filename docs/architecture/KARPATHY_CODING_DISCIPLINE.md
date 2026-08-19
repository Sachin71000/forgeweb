# ForgeWeb Karpathy Coding Discipline

**Version:** 1.0  
**Status:** Accepted policy source  
**Date:** 2026-08-15  
**Related:** [Agent operating model](./AGENT_OPERATING_MODEL.md) · [Architecture](../ARCHITECTURE.md) · [PRD](../PRD.md) · [ADR-006](./adr/ADR-006-disciplined-multi-agent-orchestration.md)

## 1. Purpose and source

ForgeWeb adopts [`multica-ai/andrej-karpathy-skills`](https://github.com/multica-ai/andrej-karpathy-skills) as the explicit upstream reference for the coding behavior shared by every planning, implementation, review, test, repair, security, documentation, and release agent. Its [`karpathy-guidelines` skill](https://github.com/multica-ai/andrej-karpathy-skills/blob/main/skills/karpathy-guidelines/SKILL.md) defines four principles: think before coding, simplicity first, surgical changes, and goal-driven execution.

ForgeWeb translates those principles into its own versioned, provider-neutral `AgentPolicyPack`. The upstream repository is a policy source, not a runtime dependency:

- its skills are not copied into generated customer applications;
- generated applications do not require a particular agent vendor or client;
- a reviewed upstream revision and content digest are pinned in each policy-pack release;
- upstream changes never alter active product behavior automatically;
- attribution and license notices are retained where required.

gstack and this discipline serve different layers. gstack informs **who does what and when**; this policy governs **how every role reasons about scope and verifies work**.

## 2. Policy precedence

When instructions conflict, agents apply this order:

1. system safety, security, privacy, and legal policy;
2. the user-approved specification and explicit user decisions;
3. ForgeWeb architecture, repository policy, and task contract;
4. this coding discipline;
5. role-specific guidance and implementation preferences.

The discipline cannot authorize a wider scope, weaker security control, new external side effect, or change to an approved product decision.

## 3. Executable principles

### 3.1 Think before coding

Before implementation, the task record must identify:

- the exact behavior to change and behavior to preserve;
- material assumptions and their evidence or confidence;
- ambiguity that could change scope, architecture, data, permissions, or external effects;
- the simplest sufficient approach;
- rejected alternatives when a trade-off is consequential;
- observable acceptance criteria and a validation plan.

Material ambiguity produces `NEEDS_CONTEXT`; it is not silently resolved by the agent. A reversible, cosmetic detail may follow a documented project default.

### 3.2 Simplicity first

- Use the smallest implementation that satisfies the approved criteria.
- Prefer an existing concrete pattern, reviewed template, or deterministic tool.
- Do not add speculative abstractions, services, packages, configuration, fallbacks, or features.
- Do not optimize for hypothetical future requirements.
- If the simplest safe solution exceeds the approved change budget, return to planning.

### 3.3 Surgical changes

- Every changed line must trace to the task objective, an acceptance criterion, or cleanup made necessary by the task.
- Do not reformat, rename, refactor, delete, or "improve" unrelated pre-existing code.
- Preserve local style unless that style violates an explicit policy.
- Remove only unused artifacts introduced or made obsolete by the current task.
- Treat contracts, migrations, authorization, authentication, dependencies, and global configuration as protected paths.

### 3.4 Goal-driven execution

- Translate goals into checks before editing.
- Use tests, builds, static checks, graph invariants, or named human approval as evidence.
- Investigate the failure class and evidence before attempting a repair.
- Never repeat the same unchanged failed attempt.
- Completion is a proposal; only independent review and policy-required validation can mark work accepted.

## 4. Task and result contract

The `AgentTask` contract records at least:

```ts
type DisciplineInput = {
  behaviorToChange: string[];
  behaviorToPreserve: string[];
  materialAssumptions: AssumptionRecord[];
  simplestSufficientApproach: string;
  rejectedAlternatives: DecisionRecord[];
  allowedPaths: string[];
  forbiddenPaths: string[];
  changeBudget: ChangeBudget;
  acceptanceCriteria: AcceptanceCriterion[];
  validationPlan: ValidationStep[];
  policyPackVersion: string;
  policySourceRevision: string;
  policySourceDigest: string;
};
```

The result records actual changed paths and line counts, assumption changes, acceptance outcomes, evidence, unresolved risks, and follow-up proposals. Follow-up ideas remain proposals unless the coordinator proves they are required by the current approved task.

## 5. Enforcement gates

| Gate | Machine or reviewer check | Failure response |
|---|---|---|
| Readiness | Assumptions, preserved behavior, approach, criteria, and validation are present | `NEEDS_CONTEXT` or return to planning |
| Scope | Changed paths and lines fit permissions and budget | Reject patch; replan rather than widen silently |
| Simplicity | New abstractions, dependencies, services, flags, or fallbacks map to a requirement | Independent reviewer requests focused simplification |
| Surgical diff | Changed lines trace to current requirements; unrelated churn is absent | Reject unrelated edits |
| Verification | Each criterion has current evidence from the correct check | Work cannot become `VALIDATED` |
| Independence | The implementer is not the accepting reviewer | Route to an independent reviewer |
| Provenance | Policy version, upstream revision/digest, task, patch, evidence, and commit link correctly | Fail closed |

Protected tests and security controls cannot be weakened by a repair agent merely to make validation pass.

## 6. Fast path for trivial work

Low-risk, single-file changes may use a compact record, but they do not bypass the principles. The minimum fast-path record is: objective, behavior to preserve, allowed path, small change budget, one or more acceptance checks, and independent acceptance when code changes are consequential.

## 7. Evaluation and metrics

Golden workflow fixtures must include a trivial fix, a UI change, an authentication or migration change, an ambiguous request, a tempting speculative abstraction, unrelated pre-existing cleanup, a failing test, and a repeated repair failure.

Track:

- unnecessary changed-line and unrelated-churn rates;
- patch size versus approved budget;
- speculative abstraction/dependency rejection rate;
- clarification timeliness and percentage of answers that changed the plan;
- first-pass acceptance and rework rates;
- test-weakened, orphaned-code, and self-approval rejection counts;
- requirement-to-change-to-evidence traceability completeness.

The desired outcome is fewer unnecessary changes and rewrites, earlier clarification of consequential ambiguity, and smaller reviewable patches—not more agent activity.

## 8. Version and upstream update policy

1. Review a specific upstream commit and license before adopting it.
2. Record repository URL, commit SHA, content digest, review date, and ForgeWeb policy version.
3. Translate guidance into provider-neutral contracts and golden tests.
4. Run policy, workflow, security, and regression fixtures.
5. Approve the policy-pack release through an architecture/security-controlled change.
6. Keep active runs pinned to the policy version with which they started.

No background sync or package update may silently change agent behavior. An upstream update is accepted only when it improves measured outcomes without weakening approved safety, product, or architecture rules.

## 9. Limitations

This discipline is a behavioral baseline, not a replacement for product requirements, architecture decisions, repository conventions, domain expertise, security review, accessibility review, or tests. Caution must be proportional: agents should ask when ambiguity is consequential, not manufacture questions for obvious and reversible details.

## 10. Primary references

- [andrej-karpathy-skills repository](https://github.com/multica-ai/andrej-karpathy-skills)
- [Repository README](https://github.com/multica-ai/andrej-karpathy-skills/blob/main/README.md)
- [Karpathy Guidelines skill](https://github.com/multica-ai/andrej-karpathy-skills/blob/main/skills/karpathy-guidelines/SKILL.md)
