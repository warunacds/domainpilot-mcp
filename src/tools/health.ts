import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { DomainPilotClient } from '../client.js';

export function registerHealthTools(server: McpServer, client: DomainPilotClient) {
  server.tool(
    'get_domain_health',
    'Get the latest health check results for a domain including scores and grade',
    {
      domain_name: z.string().describe('The domain name (e.g., "example.com")'),
    },
    async ({ domain_name }) => {
      try {
        const data = await client.get(
          `/api/domains/${encodeURIComponent(domain_name)}/health_check`
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

  server.tool(
    'run_health_check',
    'Trigger an on-demand health check for a domain',
    {
      domain_name: z.string().describe('The domain name (e.g., "example.com")'),
    },
    async ({ domain_name }) => {
      try {
        const data = await client.post(
          `/api/domains/${encodeURIComponent(domain_name)}/run_health_check`
        );
        return {
          content: [{
            type: 'text' as const,
            text: `Health check triggered for "${domain_name}".\n\n${JSON.stringify(data, null, 2)}`,
          }],
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
