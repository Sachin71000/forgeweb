# Schema-first generation and independent API verification

Scope: direct Sol staged generation, React + FastAPI + SQLite. No paid provider calls or GitHub pushes were made during this implementation. Existing projects and their source/database versions were not migrated.

## Implemented pipeline

1. Generate and validate `shared/application-schema.json` before application code. Match approved API routes; normalize colon/braced path parameters and treat /health as infrastructure. Require bounded models, valid references, supported constraints and successful workflow coverage for every route. Reject contradictory successful request examples before implementation.
2. Persist the schema checkpoint. Deterministically generate `frontend/src/lib/contracts.ts` and `backend/app/schemas/generated_contracts.py` from that same schema.
3. Generate typed HTTP route helpers with immutable methods/paths/body types and finite DTO choices. Schema-first frontend source must invoke these helpers instead of independent fetch/HTTP clients.
4. Supply models/routes to implementers without forwarding independent test examples unnecessarily. Preserve generated bindings exactly; detect modification or omission before accepting a version.
5. Compile React and run generated backend tests in isolated network-disabled containers against disposable SQLite.
6. Independently compare actual FastAPI OpenAPI request/response models, methods and success statuses against the canonical bindings.
7. Execute every schema workflow: status checks, JSON-pointer value/existence assertions, captured IDs, CRUD, response validation and derived invalid-input probes. Require successful coverage of all declared routes.
8. After mutations, perform reads in fresh Python processes against the same disposable database. Reject backends that pass same-process CRUD using only in-memory storage.
9. Preserve files and reject completion when verification fails. Legacy projects without a canonical schema are explicitly not described as having schema-first workflow coverage.

## Local evidence

- Frontend/server typechecking and production build passed.
- Full regression suite executed with `FORGEWEB_RUN_CONTAINER_TESTS=1`: **237 passed, 0 failed, 0 skipped**. Full output is in the external `schema-first-final-tests.log`.
- Real isolated Docker tests validate enum/amount/date/nullable/optional constraints in generated Pydantic bindings and compile the generated TypeScript bindings.
- Production verification path tested with a fresh canonical React/FastAPI/SQLite fixture, not the repaired PocketTrack version.
- Mutation tests reject a fake successful create that does not persist, a mismatched success status, and a backend using only an in-memory dictionary.
- Tests cover schema checkpoint reuse across instances, malformed JSON, unsupported schema keys, unsafe identifiers, invalid references, modified bindings, missing route coverage, unknown captures, inconsistent successful examples and raw-network client bypass.
- Generated HTTP helper tests verify exact methods, encoded IDs, JSON bodies, query encoding, credentials policy, 204 handling and error propagation using mocked HTTP transport.

## Boundaries — do not overstate these results

This is a strict supported schema subset, not arbitrary JSON Schema, arbitrary framework support or mathematical proof of correctness. Protected/authenticated workflows requiring custom headers or external credentials need explicit supported scenarios; they must not be fabricated. Query behavior is exercised by workflow paths/assertions; the current route helper query dictionary is not a full generated query-model system.

Automatic workflows are API-level scenarios. They are not universal browser click-through tests for every possible UI or a guarantee that every unstated business rule is covered. Existing manual browser QA is not counted as a new autonomous model build.

Paid calls remain paused, so a fresh live model-generated application using this updated path has not been attempted. Tests use deterministic fixtures/mocked provider outputs plus real local containers. Legacy provider adapters have not all been migrated to this schema-first stage. No 100% success, exhaustive vulnerability coverage or zero-failure claim is supported.

The next controlled live acceptance run requires permission to resume paid calls within the existing spending guard. It should measure first-pass generation separately from repairs; do not increase the cap or treat old repaired projects as that evidence.
