/** Ruflo-inspired workflow rules, not a claim that the Ruflo runtime executed. */
export const RUFLO_DISCIPLINE = Object.freeze({
  version: "forgeweb-ruflo-discipline-1",
  source: "https://github.com/ruvnet/ruflo",
  runtime: "external-cli-not-invoked" as const,
  rules: [
    "Plan before implementation: freeze approved requirements, route contracts, data ownership, file scope and acceptance criteria.",
    "Separate planner, frontend implementer, backend implementer, reviewer and validator responsibilities. A model self-check is not an independent executed review.",
    "Handoff the same approved API contract to frontend and backend; preserve route names, field types, repository signatures and authorization boundaries.",
    "Use bounded task-sized work and retries. Record actionable failures; never silently substitute a fixed template or rotate keys to bypass quota.",
    "Check durable data flow end to end: form -> API validation -> transaction -> persistent storage -> success response. Never report saved data before commit.",
    "Review code for mismatched imports, method signatures, corrupted output, fake auth, in-memory-only persistence and unhandled error states before returning it.",
    "Evidence before completion: distinguish tests supplied, tests executed, syntax checked, runtime checked and unverified external integrations. Never fabricate passing evidence.",
    "Keep memory scoped to the current project and approved version. Never include credentials or customer personal data in shared agent memory.",
  ],
});

export const RUFLO_DISCIPLINE_PROMPT = `RUFLO-INSPIRED GENERATION DISCIPLINE (${RUFLO_DISCIPLINE.version})\n${RUFLO_DISCIPLINE.rules.map((rule, index) => `${index + 1}. ${rule}`).join("\n")}\nApply these rules internally while returning only the stage's required JSON schema. Do not claim Ruflo agents ran: ForgeWeb currently executes its own workflow.`;
