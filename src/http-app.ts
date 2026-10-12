import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import { getOAuthProtectedResourceMetadataUrl } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Request, Response } from 'express';
import { DEFAULT_API_URL, DomainPilotClient } from './client.js';
import { createDomainPilotServer } from './server.js';
import { createTokenVerifier } from './token-verifier.js';

interface JsonRpcRequest {
  id?: string | number | null;
}

export interface DomainPilotHttpAppOptions {
  apiUrl?: string;
  host?: string;
  /** OAuth authorization server issuer (`OAUTH_ISSUER`), no trailing slash. */
  oauthIssuer: string;
  /** This server's canonical MCP endpoint (`MCP_RESOURCE_URL`). */
  resourceUrl: string;
}

function jsonRpcRequests(body: unknown): JsonRpcRequest[] {
  const messages = Array.isArray(body) ? body : [body];

  return messages.filter(
    (message): message is JsonRpcRequest =>
      typeof message === 'object' && message !== null
  );
}

function requestId(body: unknown): string | number | null {
  if (Array.isArray(body)) {
    return null;
  }

  const [message] = jsonRpcRequests(body);
  return typeof message?.id === 'string' || typeof message?.id === 'number'
    ? message.id
    : null;
}

function methodNotAllowed(_request: Request, response: Response): void {
  response
    .set('Allow', 'POST')
    .status(405)
    .json({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Method not allowed.',
      },
      id: null,
    });
}

export function createDomainPilotHttpApp(options: DomainPilotHttpAppOptions) {
  const apiUrl =
    options.apiUrl || process.env.DOMAINPILOT_API_URL || DEFAULT_API_URL;
  const app = createMcpExpressApp({ host: options.host });
  const protectedResourceMetadata = {
    resource: options.resourceUrl,
    authorization_servers: [options.oauthIssuer],
    scopes_supported: ['mcp'],
    bearer_methods_supported: ['header'],
    resource_name: 'Domain Pilot',
  };

  // RFC 9728 metadata. Browser-based clients (e.g. MCP Inspector) fetch it
  // cross-origin during OAuth discovery.
  app.get(
    [
      '/.well-known/oauth-protected-resource/mcp',
      '/.well-known/oauth-protected-resource',
    ],
    (_request, response) => {
      response
        .set('Access-Control-Allow-Origin', '*')
        .json(protectedResourceMetadata);
    }
  );

  const bearerAuth = requireBearerAuth({
    verifier: createTokenVerifier(apiUrl),
    resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(
      new URL(options.resourceUrl)
    ),
  });

  app.post('/mcp', bearerAuth, async (request, response) => {
    // requireBearerAuth only calls through with a verified token. The same
    // bearer is forwarded to the REST API on tool calls.
    const client = new DomainPilotClient(request.auth!.token, apiUrl);
    const server = createDomainPilotServer(client);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    let closed = false;
    const close = async () => {
      if (closed) {
        return;
      }

      closed = true;
      await server.close();
    };

    response.once('close', () => {
      void close();
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(request, response, request.body);
    } catch {
      await close();

      if (!response.headersSent) {
        response.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal server error.',
          },
          id: requestId(request.body),
        });
      }
    }
  });

  app.get('/mcp', methodNotAllowed);
  app.delete('/mcp', methodNotAllowed);

  return app;
}
