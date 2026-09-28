# ForgeWeb Master Generation Prompt

The runtime source of truth is [`server/generation/master-prompt.ts`](../server/generation/master-prompt.ts). This document explains how it is used.

ForgeWeb sends the master prompt as a server-side system instruction. The recommended staged pipeline uses Gemini for product architecture and frontend generation, then Groq with OpenRouter fallback for a contract-matched Python backend. It requires the models to:

- derive information architecture, navigation, visual direction, features, entities, routes, and data rules from the customer's approved requirements;
- derive a deterministic design seed and a prompt-specific design fingerprint instead of reusing generic dashboards, navigation labels, palettes, or layouts;
- generate at least six frontend modules and seven Python backend modules instead of one large file;
- keep frontend workflows, backend routes, access control, contracts, and tests consistent;
- produce responsive desktop, tablet, and mobile states with accessibility and reduced-motion behavior;
- include a standalone sandbox preview with testable local interactions while keeping external credentials as explicit adapters;
- return strict structured JSON with requirement IDs attached to every file;
- never emit secrets, `.env` files, private URLs, or fake provider connections.

The generation process has three explicit stages:

1. **Planning:** Gemini returns the product name, requirements, pages, components, design fingerprint, navigation pattern, interaction map, backend modules, API routes, data rules, and security controls.
2. **Frontend implementation:** after user confirmation, Gemini returns a modular React manifest derived from the approved architecture.
3. **Backend implementation:** Groq or OpenRouter returns a modular Python FastAPI manifest implementing the exact shared route contract.

All responses are JSON-schema constrained and then pass ForgeWeb's deterministic path, secret, size, modularity, traceability, product-name, interaction, security-boundary, and preview validation. If a provider is temporarily unavailable, ForgeWeb uses a prompt-specific deterministic product renderer and Python backend rather than a renamed generic dashboard.
