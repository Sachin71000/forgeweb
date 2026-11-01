# Read-only design and data references

Open **My Projects → Connect MCP**. The rest of ForgeWeb's UI, architecture approval and provider routing stay unchanged.

Google Stitch uses the existing server-side `STITCH_API_KEY`. Connect to inspect the available tools, then enter an existing project ID and screen ID and choose **Read screen reference**. Only `get_screen` is permitted by this connector. Its HTML is retrieved through the existing trusted-download validation and reduced to a compact design reference; scripts and asset URLs are not sent as reference content.

For Supabase, create or choose a development-only project and configure these backend environment variables:

```dotenv
SUPABASE_MCP_PROJECT_REF=your_development_project_ref
SUPABASE_MCP_TOKEN=your_supabase_mcp_access_token
FORGEWEB_SUPABASE_ENVIRONMENT=development
```

Use a credential authorized for that development project, never a production credential. A Supabase database anon/service-role API key is not the same as a hosted MCP access token. Hosted OAuth login is not implemented here; supply a compatible server-side bearer credential. Restart ForgeWeb after configuration changes.

The connector pins `https://mcp.supabase.com/mcp` with `project_ref`, `read_only=true` and `features=database`. It only calls `list_tables` for the public schema. It projects names and column types, excluding rows, defaults, comments, SQL, credentials and non-public tables. SQL execution, migrations, design generation, publishing and arbitrary MCP calls are unavailable through these new routes.

Read results are **not used automatically**. Review the reference and choose **Use in new builds**. That explicitly permits sending the projected reference to the configured generation providers. The next new architectures and their generated code receive an immutable snapshot as untrusted reference data. Existing projects and their approved specifications do not change. Stop using or disconnect to remove future selection. Connection checks close their inspection session; selection and verification are process-local and clear on restart.

The pre-existing approved-build Stitch generation stage is separate and remains unchanged. This addition does not grant any new write permissions. Generated backends still use the supplied persistence contract; reading a Supabase schema does not connect generated applications to that database.

Other Streamable HTTP servers may be allowlisted in `FORGEWEB_MCP_SERVERS`; custom servers support inventory inspection only. Arbitrary browser-provided URLs, shell commands and stdio processes are not accepted. Credentials remain in backend environment variables. Remote HTTPS endpoints must be trusted by the operator; redirects are denied. A local fixture validates protocol behavior but cannot certify a real external account's credentials or availability.

Reference: [official Supabase MCP documentation](https://supabase.com/docs/guides/ai-tools/mcp).
