#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { DomainPilotClient } from './client.js';

import { registerDomainTools } from './tools/domains.js';
import { registerHealthTools } from './tools/health.js';
import { registerAiAnalysisTools } from './tools/ai-analysis.js';
import { registerUptimeTools } from './tools/uptime.js';
import { registerDnsTools } from './tools/dns.js';
import { registerSslTools } from './tools/ssl.js';
import { registerIncidentTools } from './tools/incidents.js';
import { registerDashboardTools } from './tools/dashboard.js';
import { registerMonitoringTools } from './tools/monitoring.js';

const server = new McpServer({
  name: 'domainpilot',
  version: '1.0.0',
});

const client = new DomainPilotClient();

registerDomainTools(server, client);
registerHealthTools(server, client);
registerAiAnalysisTools(server, client);
registerUptimeTools(server, client);
registerDnsTools(server, client);
registerSslTools(server, client);
registerIncidentTools(server, client);
registerDashboardTools(server, client);
registerMonitoringTools(server, client);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('Failed to start MCP server:', error);
  process.exit(1);
});
