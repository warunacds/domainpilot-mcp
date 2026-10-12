#!/usr/bin/env node

import { createDomainPilotHttpApp } from './http-app.js';

function configuredPort(): number {
  const value = process.env.PORT || '3000';
  const port = Number(value);

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }

  return port;
}

function requiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required.`);
  }

  return value;
}

try {
  const host = process.env.HOST || '0.0.0.0';
  const port = configuredPort();
  const app = createDomainPilotHttpApp({
    host,
    oauthIssuer: requiredEnv('OAUTH_ISSUER'),
    resourceUrl: requiredEnv('MCP_RESOURCE_URL'),
  });
  const httpServer = app.listen(port, host, () => {
    console.log(`DomainPilot MCP HTTP server listening on ${host}:${port}`);
  });

  httpServer.on('error', (error) => {
    console.error('Failed to start MCP HTTP server:', error);
    process.exit(1);
  });
} catch (error) {
  console.error('Failed to start MCP HTTP server:', error);
  process.exit(1);
}
