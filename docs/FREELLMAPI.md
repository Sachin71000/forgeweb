# Local FreeLLMAPI connection

FreeLLMAPI is a provider gateway, not an unlimited inference service. Its configured
providers still enforce quotas. Keep Docker and FreeLLMAPI running.

Add these settings to the existing `.env.local` (do not replace other settings):

```dotenv
FORGEWEB_FREELLMAPI_ENABLED=true
FREELLMAPI_BASE_URL=http://127.0.0.1:3001/v1
FREELLMAPI_API_KEY=replace_with_your_private_unified_key
FREELLMAPI_MODEL=auto
```

Use the unified key from FreeLLMAPI, not the upstream Groq key. Do not use a
`VITE_` prefix, put the key in client code, or commit the environment file.
Restart `pnpm dev` after editing. `FORGEWEB_GENERATION_MODE=freellmapi` is also
supported, but the enable flag lets you retain your previous mode unchanged.

When enabled, architecture planning, React generation and Python generation use
the gateway's configured routing chain. Architecture approval, Stitch, MCP,
frontend/backend contract mapping, source checks and runtime checks remain in the
existing workflow. Direct-provider credentials remain saved but are not retried
outside the gateway in this mode; configure fallback in FreeLLMAPI. Set the enable
flag to `false` to restore the previous direct-provider pipeline.

The adapter requests structured JSON using `response_format: json_schema`. The
selected upstream model must support that format and sufficient output tokens.
An ordinary chat reply does not establish that full application generation works.
Source is generated file-by-file (3,200 output tokens, 4,800 for preview) rather
than squeezing the application into one response. Truncation/invalid JSON gets
one response-only retry with a larger bounded budget; checked files are cached
locally for identical retries. Planning starts at 4,500 tokens. Authentication
and quota failures are not handled as output truncation.
Invalid JSON, repeatedly truncated responses and invalid source are rejected rather
than replaced with a generic template. Only loopback gateway URLs are accepted,
and redirects are rejected to avoid forwarding the unified key elsewhere.

Verification: `pnpm typecheck`, `pnpm test`, `pnpm build`. A live build additionally
requires the private unified key and available provider quota. Never paste the key
into a support message or test report.
