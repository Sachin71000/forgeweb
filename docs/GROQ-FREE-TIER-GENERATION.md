# Groq free-tier generation

Enable FORGEWEB_BACKEND_PROVIDER=groq alongside frontend-dual-gemini-backend mode. This overrides architecture/backend to Groq and activates file-level generation for Groq frontend/backend requests.

- Maximum 800 output tokens per request.
- Shared in-process 61-second start interval per key/model. Concurrent builds queue behind the same pacer; external processes/applications are not coordinated.
- One frontend or backend file per request, with previous source supplied for compatible imports and signatures.
- Dependency-first backend order: models, schemas, service, routes, entrypoint.
- Per-file progress reports waiting and received states.
- Python syntax check immediately after each file; one paced syntax repair at most. Persistent syntax failure is terminal, rather than triggering whole-project retry through the existing MODEL_* 422 repair path.
- Truncation and unexpected paths are rejected. No silent partial file is published.
- No unpaced transport retries in this mode. Provider quota errors still require waiting or configuration changes.
- Backend selection does not invoke Gemini or OpenRouter. Existing frontend provider fallback configuration remains unchanged.

Live verification on 2026-10-26: all five backend requests returned HTTP 200 at 800 tokens with pacing; the final syntax check rejected three files. This demonstrates quota-compatible requests, NOT a working backend. Per-file bounded repair was added afterward and tested with fixtures; no additional live repair run or end-to-end portfolio acceptance has been completed.

Expect 15–20 minutes for an unqueued full build and potentially longer with repairs/other builds. Architecture JSON or an individual source file may still exceed the small budget. File-level checkpoints/resume, full frontend compilation, backend integration testing and external persistence acceptance remain separate release gates. The existing single combined Frontend/Backend file-view entries and export paths are unchanged.
