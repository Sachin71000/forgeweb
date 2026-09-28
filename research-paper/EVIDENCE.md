# Evidence and scope

## Local-model paper revision (22 September 2026)

The revised manuscript proposes replacing hosted backend generation with a locally fine-tuned LLaMA-based checkpoint. This is a design change, not an implemented or evaluated model integration. The 14 passing tests below belong to the earlier platform baseline. Training data, checkpoint identity, hardware, and training/evaluation results have not been supplied. Gemini remains in the planning/frontend path, so the complete pipeline is not described as offline. No application code was changed for this manuscript update.

Prepared on 21 September 2026 from the ForgeWeb workspace. This paper describes an implementation prototype, not a controlled user study or a benchmark demonstrating superiority over other systems.

## Checks rerun during preparation

- `pnpm test`: all 14 existing automated tests passed, none failed or skipped.
- `pnpm typecheck`: completed successfully.

These tests exercise platform workflow, HTTP behavior, approval, injected provider results, domain fallback artifacts, version behavior, and input rejection. They are not live-provider generation-quality experiments. Their runtime must not be interpreted as website-generation latency.

## Important implementation distinctions

Source anchors relative to the ForgeWeb repository: `server/workflow.ts` (planning, approval, roles, generation and checks), `server/providers/generation-provider.ts` (provider routing), `server/store.ts` (JSON persistence), `server/project-workspace.ts` (files and snapshots), `server/policy.ts` (scope policy), `server/product-intent.ts` and `server/generated-*.ts` (local domain output), and `server/tests/workflow.test.ts` / `server/tests/app.test.ts` (the reproduced suite).

- Platform: React/TypeScript/Vite and a Node HTTP API. Project state uses a serialized local JSON store.
- Generated artifacts: React frontend and Python FastAPI backend files, a shared contract, and documentation.
- The HTML iframe preview is a separate document. Displaying it does not establish that the exported FastAPI server is running or that frontend/backend integration has passed execution tests.
- Planner, implementation, reviewer, and validator task records do not imply that four autonomous model agents run independently.
- The internal requirement/file/check graph is not evidence of executing the external code-review-graph parser.
- Local domain fallbacks are bounded generators, not a guarantee of entirely unique results for every prompt.
- Artifact presence, mapping, and structural checks do not prove authentication security or production readiness.
- PostgreSQL provisioning, distributed queues, isolated full-stack execution, comparative prompt-fidelity experiments, and user studies are future work where described.

The paper does not report fabricated accuracy percentages, generation times, user-study scores, or model-comparison rankings. Provider credentials are excluded from all paper files.
