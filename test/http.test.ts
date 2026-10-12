import assert from 'node:assert/strict';
import { once } from 'node:events';
import http, {
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import type { Express } from 'express';
import request from 'supertest';
import { createDomainPilotHttpApp } from '../src/http-app.js';

const MCP_ACCEPT = 'application/json, text/event-stream';
const OAUTH_ISSUER = 'http://localhost:3000';
const MCP_RESOURCE_URL = 'http://localhost:3100/mcp';
const RESOURCE_METADATA_URL =
  'http://localhost:3100/.well-known/oauth-protected-resource/mcp';
const TOKEN_INFO_PATH = '/api/v1/mcp/token_info';

interface MockApi {
  close(): Promise<void>;
  url: string;
}

function domain(name: string) {
  return {
    id: 1,
    name,
    online: true,
    health_grade: 'A',
    expires_at: null,
    uptime_monitoring_enabled: true,
    plan_disabled: false,
    auto_renew: null,
    registrar_name: null,
  };
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(body));
}

function sendTokenInfo(
  response: ServerResponse,
  expiresAt: string | null = null
): void {
  sendJson(response, 200, { user_id: 1, expires_at: expiresAt, scopes: ['mcp'] });
}

function createApp(apiUrl?: string) {
  return createDomainPilotHttpApp({
    apiUrl,
    oauthIssuer: OAUTH_ISSUER,
    resourceUrl: MCP_RESOURCE_URL,
  });
}

async function startMockApi(
  handler: (request: IncomingMessage, response: ServerResponse) => void
): Promise<MockApi> {
  const server: Server = http.createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  const address = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      }),
  };
}

function postMcp(app: Express, body: unknown, token?: string) {
  let pendingRequest = request(app)
    .post('/mcp')
    .set('Accept', MCP_ACCEPT)
    .set('Content-Type', 'application/json');

  if (token) {
    pendingRequest = pendingRequest.set('Authorization', `Bearer ${token}`);
  }

  return pendingRequest.send(body);
}

const initializeRequest = {
  jsonrpc: '2.0',
  id: 'initialize',
  method: 'initialize',
  params: {
    protocolVersion: '2025-03-26',
    capabilities: {},
    clientInfo: {
      name: 'domainpilot-http-test',
      version: '1.0.0',
    },
  },
};

const toolsListRequest = {
  jsonrpc: '2.0',
  id: 'tools',
  method: 'tools/list',
  params: {},
};

function assertInvalidTokenChallenge(response: request.Response): void {
  assert.equal(response.status, 401);
  assert.equal(response.body.error, 'invalid_token');
  assert.match(
    response.headers['www-authenticate'],
    /^Bearer error="invalid_token"/
  );
  assert.ok(
    response.headers['www-authenticate'].includes(
      `resource_metadata="${RESOURCE_METADATA_URL}"`
    )
  );
}

function assertServerError(
  response: request.Response,
  errorLog: { mock: { calls: Array<{ arguments: unknown[] }> } },
  token: string
): void {
  assert.equal(response.status, 500);
  assert.equal(response.body.error, 'server_error');
  assert.equal(response.headers['www-authenticate'], undefined);

  const logged = errorLog.mock.calls.map(({ arguments: args }) => args.join(' '));
  assert.equal(logged.length, 1);
  assert.match(logged[0], /^Token verification failed: /);
  assert.ok(!logged[0].includes(token));
}

function listDomainsCall(id: string | number) {
  return {
    jsonrpc: '2.0',
    id,
    method: 'tools/call',
    params: {
      name: 'list_domains',
      arguments: {},
    },
  };
}

for (const path of [
  '/.well-known/oauth-protected-resource/mcp',
  '/.well-known/oauth-protected-resource',
]) {
  test(`protected resource metadata is served at ${path}`, async () => {
    const response = await request(createApp()).get(path);

    assert.equal(response.status, 200);
    assert.equal(response.headers['access-control-allow-origin'], '*');
    assert.deepEqual(response.body, {
      resource: MCP_RESOURCE_URL,
      authorization_servers: [OAUTH_ISSUER],
      scopes_supported: ['mcp'],
      bearer_methods_supported: ['header'],
      resource_name: 'Domain Pilot',
    });
  });
}

test('initialize without a bearer returns 401 pointing at the resource metadata', async () => {
  const response = await postMcp(createApp(), initializeRequest);

  assertInvalidTokenChallenge(response);
});

test('tools/call without a bearer returns 401 and never falls back to the environment', async () => {
  let apiRequests = 0;
  const mockApi = await startMockApi((_request, response) => {
    apiRequests += 1;
    sendJson(response, 200, []);
  });
  const previousToken = process.env.DOMAINPILOT_API_TOKEN;
  process.env.DOMAINPILOT_API_TOKEN = 'server-environment-token';

  try {
    const response = await postMcp(
      createApp(mockApi.url),
      listDomainsCall('unauthorized')
    );

    assertInvalidTokenChallenge(response);
    assert.equal(apiRequests, 0);
  } finally {
    if (previousToken === undefined) {
      delete process.env.DOMAINPILOT_API_TOKEN;
    } else {
      process.env.DOMAINPILOT_API_TOKEN = previousToken;
    }
    await mockApi.close();
  }
});

test('a token rejected by token_info returns 401 invalid_token', async () => {
  const paths: Array<string | undefined> = [];
  const mockApi = await startMockApi((apiRequest, response) => {
    paths.push(apiRequest.url);
    sendJson(response, 401, { error: 'Unauthorized' });
  });

  try {
    const response = await postMcp(
      createApp(mockApi.url),
      toolsListRequest,
      'revoked-token'
    );

    assertInvalidTokenChallenge(response);
    assert.deepEqual(paths, [TOKEN_INFO_PATH]);
  } finally {
    await mockApi.close();
  }
});

test('a token whose token_info expires_at has passed returns 401 invalid_token', async () => {
  const mockApi = await startMockApi((_request, response) => {
    sendTokenInfo(response, new Date(Date.now() - 60_000).toISOString());
  });

  try {
    const response = await postMcp(
      createApp(mockApi.url),
      toolsListRequest,
      'expired-oauth-token'
    );

    assertInvalidTokenChallenge(response);
  } finally {
    await mockApi.close();
  }
});

test('unauthenticated text/plain and batch requests are rejected before transport handling', async () => {
  const app = createApp();
  const plainTextResponse = await request(app)
    .post('/mcp')
    .set('Accept', MCP_ACCEPT)
    .set('Content-Type', 'text/plain')
    .send(JSON.stringify(listDomainsCall('plain-text')));
  const batchResponse = await postMcp(app, [
    toolsListRequest,
    listDomainsCall('batch'),
  ]);

  assertInvalidTokenChallenge(plainTextResponse);
  assertInvalidTokenChallenge(batchResponse);
});

test('a token_info server error returns 500 rather than asking the client to re-authenticate', async (t) => {
  const errorLog = t.mock.method(console, 'error', () => {});
  const mockApi = await startMockApi((_request, response) => {
    sendJson(response, 503, { error: 'Service Unavailable' });
  });

  try {
    const response = await postMcp(
      createApp(mockApi.url),
      toolsListRequest,
      'valid-token'
    );

    assertServerError(response, errorLog, 'valid-token');
    assert.match(errorLog.mock.calls[0].arguments[0] as string, /HTTP 503/);
  } finally {
    await mockApi.close();
  }
});

test('an unreachable token_info endpoint returns 500, not invalid_token', async (t) => {
  const errorLog = t.mock.method(console, 'error', () => {});
  const mockApi = await startMockApi((_request, response) => {
    sendJson(response, 200, {});
  });
  await mockApi.close();

  const response = await postMcp(
    createApp(mockApi.url),
    toolsListRequest,
    'valid-token'
  );

  assertServerError(response, errorLog, 'valid-token');
});

test('an unparseable token_info expires_at returns 500, not invalid_token', async (t) => {
  const errorLog = t.mock.method(console, 'error', () => {});
  const mockApi = await startMockApi((_request, response) => {
    sendTokenInfo(response, 'not-a-date');
  });

  try {
    const response = await postMcp(
      createApp(mockApi.url),
      toolsListRequest,
      'valid-token'
    );

    assertServerError(response, errorLog, 'valid-token');
    assert.match(
      errorLog.mock.calls[0].arguments[0] as string,
      /unparseable expires_at/
    );
  } finally {
    await mockApi.close();
  }
});

for (const { kind, token, expiresAt } of [
  {
    kind: 'an OAuth access token',
    token: 'dp_mcp_oauth-access-token',
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  },
  { kind: 'a static MCP token', token: 'dp_mcp_static-token', expiresAt: null },
]) {
  test(`${kind} can initialize and list tools`, async () => {
    const authorizations: Array<string | undefined> = [];
    const paths: Array<string | undefined> = [];
    const mockApi = await startMockApi((apiRequest, response) => {
      authorizations.push(apiRequest.headers.authorization);
      paths.push(apiRequest.url);
      sendTokenInfo(response, expiresAt);
    });

    try {
      const app = createApp(mockApi.url);
      const initializeResponse = await postMcp(app, initializeRequest, token);

      assert.equal(initializeResponse.status, 200);
      assert.equal(initializeResponse.body.result.serverInfo.name, 'domainpilot');

      const toolsResponse = await postMcp(app, toolsListRequest, token);

      assert.equal(toolsResponse.status, 200);
      assert.ok(
        toolsResponse.body.result.tools.some(
          (tool: { name: string }) => tool.name === 'list_domains'
        )
      );
      assert.deepEqual(authorizations, [`Bearer ${token}`, `Bearer ${token}`]);
      assert.deepEqual(paths, [TOKEN_INFO_PATH, TOKEN_INFO_PATH]);
    } finally {
      await mockApi.close();
    }
  });
}

test('tools/call forwards the exact request bearer to the REST API', async () => {
  const authorizations: Array<string | undefined> = [];
  const paths: Array<string | undefined> = [];
  const mockApi = await startMockApi((apiRequest, response) => {
    authorizations.push(apiRequest.headers.authorization);
    paths.push(apiRequest.url);

    if (apiRequest.url === TOKEN_INFO_PATH) {
      sendTokenInfo(response);
    } else {
      sendJson(response, 200, [domain('exact-token.example')]);
    }
  });

  try {
    const response = await postMcp(
      createApp(mockApi.url),
      listDomainsCall('authorized'),
      'request-specific-token'
    );

    assert.equal(response.status, 200);
    assert.deepEqual(authorizations, [
      'Bearer request-specific-token',
      'Bearer request-specific-token',
    ]);
    assert.deepEqual(paths, [TOKEN_INFO_PATH, '/api/domains']);
    assert.match(response.body.result.content[0].text, /exact-token\.example/);
  } finally {
    await mockApi.close();
  }
});

test('a REST API 401 becomes the existing friendly MCP tool error', async () => {
  const mockApi = await startMockApi((apiRequest, response) => {
    if (apiRequest.url === TOKEN_INFO_PATH) {
      sendTokenInfo(response);
    } else {
      sendJson(response, 401, { error: 'Unauthorized' });
    }
  });

  try {
    const response = await postMcp(
      createApp(mockApi.url),
      listDomainsCall('expired'),
      'expired-token'
    );

    assert.equal(response.status, 200);
    assert.equal(response.body.result.isError, true);
    assert.equal(
      response.body.result.content[0].text,
      'Error: Your Domain Pilot API token is invalid or expired. Generate a new one at your Domain Pilot settings page.'
    );
  } finally {
    await mockApi.close();
  }
});

test(
  'concurrent requests keep different bearer tokens isolated while both REST calls are in flight',
  { timeout: 5_000 },
  async () => {
    interface PendingApiResponse {
      authorization: string;
      response: ServerResponse;
    }

    const pendingResponses: PendingApiResponse[] = [];
    let activeRequests = 0;
    let maxActiveRequests = 0;

    const respond = ({ authorization, response }: PendingApiResponse) => {
      const token = authorization.replace(/^Bearer /, '');
      sendJson(response, 200, [domain(`${token}.example`)]);
      activeRequests -= 1;
    };

    const mockApi = await startMockApi((apiRequest, response) => {
      if (apiRequest.url === TOKEN_INFO_PATH) {
        sendTokenInfo(response);
        return;
      }

      const authorization = apiRequest.headers.authorization || '';
      activeRequests += 1;
      maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
      pendingResponses.push({ authorization, response });

      if (pendingResponses.length === 2) {
        respond(pendingResponses[1]);
        setTimeout(() => respond(pendingResponses[0]), 10);
      }
    });

    try {
      const app = createApp(mockApi.url);
      const [firstResponse, secondResponse] = await Promise.all([
        postMcp(app, listDomainsCall('first'), 'token-a'),
        postMcp(app, listDomainsCall('second'), 'token-b'),
      ]);

      assert.equal(maxActiveRequests, 2);
      assert.deepEqual(
        pendingResponses.map(({ authorization }) => authorization).sort(),
        ['Bearer token-a', 'Bearer token-b']
      );
      assert.match(firstResponse.body.result.content[0].text, /token-a\.example/);
      assert.doesNotMatch(
        firstResponse.body.result.content[0].text,
        /token-b\.example/
      );
      assert.match(secondResponse.body.result.content[0].text, /token-b\.example/);
      assert.doesNotMatch(
        secondResponse.body.result.content[0].text,
        /token-a\.example/
      );
    } finally {
      await mockApi.close();
    }
  }
);
