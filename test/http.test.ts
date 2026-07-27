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

test('initialize and tools/list work without authentication', async () => {
  const app = createDomainPilotHttpApp();
  const initializeResponse = await postMcp(app, {
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
  });

  assert.equal(initializeResponse.status, 200);
  assert.equal(initializeResponse.body.result.serverInfo.name, 'domainpilot');

  const toolsResponse = await postMcp(app, {
    jsonrpc: '2.0',
    id: 'tools',
    method: 'tools/list',
    params: {},
  });

  assert.equal(toolsResponse.status, 200);
  assert.ok(
    toolsResponse.body.result.tools.some(
      (tool: { name: string }) => tool.name === 'list_domains'
    )
  );
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
    const app = createDomainPilotHttpApp({ apiUrl: mockApi.url });
    const response = await postMcp(app, listDomainsCall('unauthorized'));

    assert.equal(response.status, 401);
    assert.equal(response.headers['www-authenticate'], 'Bearer');
    assert.equal(response.body.id, 'unauthorized');
    assert.match(response.body.error.message, /Bearer token required/);
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

test('tools/call cannot bypass the bearer gate with an SDK-accepted JSON media type', async () => {
  const app = createDomainPilotHttpApp();
  const response = await request(app)
    .post('/mcp')
    .set('Accept', MCP_ACCEPT)
    .set('Content-Type', 'application/json-seq')
    .send(JSON.stringify(listDomainsCall('json-seq')));

  assert.equal(response.status, 401);
  assert.equal(response.headers['www-authenticate'], 'Bearer');
  assert.equal(response.body.id, 'json-seq');
});

test('an unauthenticated batch containing tools/call is rejected before transport handling', async () => {
  const app = createDomainPilotHttpApp();
  const response = await postMcp(app, [
    {
      jsonrpc: '2.0',
      id: 'list',
      method: 'tools/list',
      params: {},
    },
    listDomainsCall('call'),
  ]);

  assert.equal(response.status, 401);
  assert.equal(response.body.id, null);
});

test('tools/call forwards the exact request bearer to the REST API', async () => {
  const authorizations: Array<string | undefined> = [];
  const paths: Array<string | undefined> = [];
  const mockApi = await startMockApi((apiRequest, response) => {
    authorizations.push(apiRequest.headers.authorization);
    paths.push(apiRequest.url);
    sendJson(response, 200, [domain('exact-token.example')]);
  });

  try {
    const app = createDomainPilotHttpApp({ apiUrl: mockApi.url });
    const response = await postMcp(
      app,
      listDomainsCall('authorized'),
      'request-specific-token'
    );

    assert.equal(response.status, 200);
    assert.deepEqual(authorizations, ['Bearer request-specific-token']);
    assert.deepEqual(paths, ['/api/domains']);
    assert.match(response.body.result.content[0].text, /exact-token\.example/);
  } finally {
    await mockApi.close();
  }
});

test('a REST API 401 becomes the existing friendly MCP tool error', async () => {
  const mockApi = await startMockApi((_request, response) => {
    sendJson(response, 401, { error: 'Unauthorized' });
  });

  try {
    const app = createDomainPilotHttpApp({ apiUrl: mockApi.url });
    const response = await postMcp(
      app,
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
      const app = createDomainPilotHttpApp({ apiUrl: mockApi.url });
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
