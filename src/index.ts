#!/usr/bin/env node

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { DEFAULT_API_URL, DomainPilotClient } from './client.js';
import { createDomainPilotServer } from './server.js';

const token = process.env.DOMAINPILOT_API_TOKEN || '';

if (!token) {
  throw new Error(
    'DOMAINPILOT_API_TOKEN is required. Generate one at your Domain Pilot settings page.'
  );
}

const apiUrl = process.env.DOMAINPILOT_API_URL || DEFAULT_API_URL;
const client = new DomainPilotClient(token, apiUrl);
const server = createDomainPilotServer(client);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('Failed to start MCP server:', error);
  process.exit(1);
});
