import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express from 'express';
import type { Request, Response } from 'express';
import { DEFAULT_API_URL, DomainPilotClient } from './client.js';
import { createDomainPilotServer } from './server.js';

interface JsonRpcRequest {
  id?: string | number | null;
  method?: string;
}

export interface DomainPilotHttpAppOptions {
  apiUrl?: string;
  host?: string;
}

function jsonRpcRequests(body: unknown): JsonRpcRequest[] {
  const messages = Array.isArray(body) ? body : [body];

  return messages.filter(
    (message): message is JsonRpcRequest =>
      typeof message === 'object' && message !== null
  );
}

function callsTool(body: unknown): boolean {
  return jsonRpcRequests(body).some((message) => message.method === 'tools/call');
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

function bearerToken(request: Request): string | undefined {
  const authorization = request.get('Authorization');
  const match = authorization?.match(/^Bearer ([^\s]+)$/i);
  return match?.[1];
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

export function createDomainPilotHttpApp(
  options: DomainPilotHttpAppOptions = {}
) {
  const apiUrl =
    options.apiUrl || process.env.DOMAINPILOT_API_URL || DEFAULT_API_URL;
  const app = createMcpExpressApp({ host: options.host });

  // Match the SDK's accepted JSON media types so every tools/call body is
  // inspected by the bearer gate before transport handling.
  app.use(
    express.json({
      type: (request) =>
        request.headers['content-type']
          ?.toLowerCase()
          .includes('application/json') ?? false,
    })
  );

  app.post('/mcp', async (request, response) => {
    const token = bearerToken(request);

    if (callsTool(request.body) && !token) {
      response
        .set('WWW-Authenticate', 'Bearer')
        .status(401)
        .json({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Bearer token required for tools/call.',
          },
          id: requestId(request.body),
        });
      return;
    }

    const client = new DomainPilotClient(token || '', apiUrl);
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
