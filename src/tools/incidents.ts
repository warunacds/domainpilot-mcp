import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { DomainPilotClient } from '../client.js';

export function registerIncidentTools(server: McpServer, client: DomainPilotClient) {
  server.tool(
    'get_incidents',
    'List incidents (downtime events) for a domain',
    {
      domain_name: z.string().describe('The domain name (e.g., "example.com")'),
    },
    async ({ domain_name }) => {
      try {
        const data = await client.get(
          `/api/domains/${encodeURIComponent(domain_name)}/incidents`
        );
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${(error as Error).message}` }],
          isError: true,
        };
      }
    }
  );
}
