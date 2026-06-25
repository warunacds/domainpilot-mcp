# DomainPilot MCP Server

A Model Context Protocol (MCP) server that connects AI assistants to your [Domain Pilot](https://domainpilot.io) account. Manage domains, DNS records, uptime monitoring, SSL status, and more through natural language in Claude Desktop, Claude Code, or any MCP-compatible client.

## Quick Start

The server is published on npm, so there's nothing to install or build -- `npx` fetches and runs it on demand.

### 1. Get your API token

Generate an MCP API token from your Domain Pilot settings page at [domainpilot.io/settings/mcp](https://domainpilot.io/settings/mcp).

### 2. Configure your AI client

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

#### Claude Code

Add to your Claude Code MCP settings (`.claude/settings.json`):

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
| `DOMAINPILOT_API_TOKEN` | Yes | -- | Your Domain Pilot MCP API token |
| `DOMAINPILOT_API_URL` | No | `https://api.domainpilot.io` | API base URL (override for development) |

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
