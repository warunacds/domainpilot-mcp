# DomainPilot MCP Server

A Model Context Protocol (MCP) server that connects AI assistants to your [Domain Pilot](https://domainpilot.io) account. Manage domains, DNS records, uptime monitoring, SSL status, and more through natural language in Claude Desktop, Claude Code, or any MCP-compatible client.

## Connect remotely (sign in with Domain Pilot)

The hosted server lives at `https://mcp.domainpilot.io/mcp`. Add that URL to your client and sign in with your Domain Pilot account when prompted -- there is no token to copy. You stay signed in as long as you keep using the client; after 30 days without use, it asks you to sign in again.

### Claude (web and desktop)

Settings -> Connectors -> **Add custom connector**, enter `https://mcp.domainpilot.io/mcp`, then connect and sign in.

### ChatGPT (web and desktop)

Turn on developer mode, then create a connector with the MCP server URL `https://mcp.domainpilot.io/mcp` and OAuth authentication, and sign in.

### Claude Code

```bash
claude mcp add --transport http domainpilot https://mcp.domainpilot.io/mcp
```

Then run `/mcp` inside Claude Code and choose to authenticate; it opens your browser to sign in.

### Other clients (Cursor, VS Code, Codex, ...)

Any MCP client that supports remote servers with OAuth works with the same URL. Clients that can only send a fixed header can use a static MCP API token instead: `Authorization: Bearer your-token-here`.

To revoke a client's access, disconnect it under **Connected apps** on your Domain Pilot MCP settings page.

## Quick Start

The server is published on npm, so there's nothing to install or build -- `npx` fetches and runs it on demand.

### 1. Get your API token

Generate an MCP API token from your Domain Pilot settings page at [domainpilot.io/settings/mcp](https://domainpilot.io/settings/mcp).

### 2. Configure your AI client

#### Claude Code (recommended)

One command -- no config file to edit:

```bash
claude mcp add domainpilot --env DOMAINPILOT_API_TOKEN=your-token-here -- npx -y domainpilot-mcp
```

The `--` separates Claude's flags from the command it runs; everything after it is the launch command. Pin a version with `domainpilot-mcp@1.0.2` if you prefer.

#### Claude Desktop

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "domainpilot": {
      "command": "npx",
      "args": ["-y", "domainpilot-mcp"],
      "env": {
        "DOMAINPILOT_API_TOKEN": "your-token-here"
      }
    }
  }
}
```

#### ChatGPT (or other MCP clients)

Use the same pattern -- run `npx -y domainpilot-mcp` and set the `DOMAINPILOT_API_TOKEN` environment variable.

### Running from source (development)

To run a local checkout instead of the published package:

```bash
git clone https://github.com/warunacds/domainpilot-mcp.git
cd domainpilot-mcp
npm install
npm run build
```

Then point your client's `command`/`args` at the built entry point -- `"command": "node", "args": ["/absolute/path/to/domainpilot-mcp/dist/index.js"]`.

### Remote HTTP development

The remote entrypoint serves stateless Streamable HTTP at `/mcp`. It needs `OAUTH_ISSUER` and `MCP_RESOURCE_URL` (see [Environment Variables](#environment-variables)) and refuses to start without them:

```bash
# Development, against a local Domain Pilot API on :3000
OAUTH_ISSUER=http://localhost:3000 \
MCP_RESOURCE_URL=http://localhost:3100/mcp \
DOMAINPILOT_API_URL=http://localhost:3000 \
PORT=3100 npm run dev:http

# Built server (same variables)
npm run build
npm run start:http
```

Every request needs a bearer token -- an OAuth access token or a static MCP API token. The server validates it against the Domain Pilot API. Without a valid token it returns `401` with a `WWW-Authenticate` header whose `resource_metadata` points at `/.well-known/oauth-protected-resource/mcp`, which is how clients discover the sign-in flow:

```bash
curl http://localhost:3100/.well-known/oauth-protected-resource/mcp
```

```bash
curl http://localhost:3100/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H 'Authorization: Bearer your-token-here' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

```bash
curl http://localhost:3100/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H 'Authorization: Bearer your-token-here' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"list_domains","arguments":{}}}'
```

The HTTP entrypoint never uses `DOMAINPILOT_API_TOKEN`; each request uses only
the bearer token supplied with it, and tool calls forward that same token to the API.

## Available Tools

| Tool | Description |
|------|-------------|
| `list_domains` | List all your domains with status, health grade, and monitoring state |
| `get_domain` | Get detailed info about a specific domain (uptime, SSL, health, expiry) |
| `add_domain` | Add a new domain to monitor |
| `get_domain_health` | Get latest health check results including scores and grade |
| `run_health_check` | Trigger an on-demand health check for a domain |
| `get_ai_analysis` | Get AI-powered analysis with findings and recommendations |
| `get_uptime` | Get uptime statistics for a domain (24h, 7d, or 30d) |
| `get_dns_records` | List all DNS records for a domain |
| `add_dns_record` | Add a DNS record (A, AAAA, CNAME, MX, TXT, NS) |
| `update_dns_record` | Update an existing DNS record |
| `acknowledge_dns_changes` | Acknowledge detected DNS changes for a domain |
| `get_ssl_status` | Get SSL certificate status and details |
| `get_incidents` | List downtime incidents for a domain |
| `get_dashboard_stats` | Get portfolio overview (total domains, online count, alerts) |
| `toggle_monitoring` | Enable or disable uptime monitoring for a domain |

> **Note:** DNS records can be added and updated, but **deletion is intentionally not exposed** through this server. Removing a record is the highest-risk DNS operation and the hardest to undo, so it is left out by design. Delete records via the Domain Pilot web UI instead.

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DOMAINPILOT_API_TOKEN` | Stdio only | -- | Your Domain Pilot MCP API token |
| `DOMAINPILOT_API_URL` | No | `https://api.domainpilot.io` | API base URL (override for development) |
| `OAUTH_ISSUER` | HTTP only | -- | OAuth authorization server advertised in the protected resource metadata (`https://api.domainpilot.io` in production). No trailing slash. |
| `MCP_RESOURCE_URL` | HTTP only | -- | Public URL of this server's MCP endpoint (`https://mcp.domainpilot.io/mcp` in production) |
| `PORT` | HTTP only | `3000` | Port for the Streamable HTTP server |
| `HOST` | HTTP only | `0.0.0.0` | Bind address for the Streamable HTTP server |

## Development

```bash
# Run in development mode (no build needed)
DOMAINPILOT_API_TOKEN=your-token npm run dev

# Build for production
npm run build

# Run the built server
DOMAINPILOT_API_TOKEN=your-token npm start
```

## Troubleshooting

### "DOMAINPILOT_API_TOKEN is required"

Make sure the `DOMAINPILOT_API_TOKEN` environment variable is set in your MCP client configuration. Generate a token at your Domain Pilot settings page.

### "Your Domain Pilot API token is invalid or expired"

Your token may have been revoked or expired. Generate a new one from your Domain Pilot settings page.

### "Resource not found"

Double-check the domain name. It must match exactly as shown in your Domain Pilot account (e.g., `example.com`, not `www.example.com` or `https://example.com`).

### Server not appearing in Claude Desktop

1. Make sure the path to `dist/index.js` is absolute (not relative)
2. Restart Claude Desktop after editing the config
3. Check that `node` is available in your PATH

### Connection issues

If using a custom `DOMAINPILOT_API_URL`, verify the URL is correct and the server is reachable. The default URL points to the production Domain Pilot API.

## License

MIT
