# ForgeWeb Master Generation Prompt

The runtime source of truth is [`server/generation/master-prompt.ts`](../server/generation/master-prompt.ts). This document explains how it is used.

ForgeWeb sends the master prompt as a server-side Gemini system instruction. It requires the model to:

- derive information architecture, navigation, visual direction, features, entities, routes, and data rules from the customer's approved requirements;
- avoid reusing generic dashboards, navigation labels, palettes, and layouts;
- generate at least five frontend modules and four backend modules instead of one large file;
- keep frontend workflows, backend routes, access control, contracts, and tests consistent;
- produce responsive desktop, tablet, and mobile states with accessibility and reduced-motion behavior;
- include a standalone sandbox preview while keeping external credentials as explicit adapters;
- return strict structured JSON with requirement IDs attached to every file;
- never emit secrets, `.env` files, private URLs, or fake provider connections.

The generation process has two model calls:

1. **Planning:** Gemini returns the product name, requirements, pages, components, visual direction, backend modules, API routes, data rules, and security controls.
2. **Implementation:** after user confirmation, Gemini returns a 15–28 file application manifest.

Both responses are schema-constrained and then pass ForgeWeb's deterministic path, secret, size, modularity, traceability, security-boundary, and preview validation. If Gemini is not configured or a provider response fails validation, ForgeWeb transparently uses its deterministic local generator so a live demo can still complete.
