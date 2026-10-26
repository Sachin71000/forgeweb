# Ruflo setup and ForgeWeb generation discipline

Installed globally: ruflo 3.63.3. Verified with ruflo --version and ruflo --help.
OpenCodeReview 1.13.3 is also installed separately.

ForgeWeb adopts Ruflo-inspired task boundaries, shared-contract handoffs, scoped memory, bounded retries and evidence-based completion through server/generation/ruflo-discipline.ts. This pack is included in the system instructions for Gemini, Groq and OpenRouter and referenced by the existing task policy. Existing architecture approval, implementation, review and validation stages remain intact.

No Ruflo swarm, independent model reviewer, self-learning memory, daemon, MCP server or automatic hooks are running as part of generation. Prompt instructions influence models; they do not enforce runtime correctness or prove generated tests passed. Existing automated gates remain the enforcement mechanism. The CLI installation itself does not resolve provider quota, credit limits or malformed generated code.

Provider mapping is unchanged: Groq then OpenRouter for frontend, optional extra Gemini frontend fallbacks, and Gemini for architecture/backend. Keys stay server-side. The interface and project history are unchanged.

Verification: 79 tests passed, frontend/server TypeScript checks passed, production frontend build passed. No paid generation requests were made for this change. Tests verify the discipline reaches all three provider families, not that a live Ruflo agent generated a working product.

Optional future runtime integration must explicitly define task inputs/outputs, execution isolation, approvals, budget limits, timeouts, artifact validation and secret filtering before invoking agent commands. Do not enable broad autonomous hooks on saved customer projects by default.

Upstream reference: https://github.com/ruvnet/ruflo
Adopted workflow principles are project-specific adaptations, not a certification or verbatim upstream policy.
