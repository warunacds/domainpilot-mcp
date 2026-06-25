import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { DomainPilotClient } from '../client.js';

export function registerUptimeTools(server: McpServer, client: DomainPilotClient) {
  server.tool(
    'get_uptime',
    'Get uptime statistics for a domain',
    {
      domain_name: z.string().describe('The domain name (e.g., "example.com")'),
      period: z
        .enum(['24h', '7d', '30d'])
        .optional()
        .default('30d')
        .describe('Time period for uptime stats: "24h", "7d", or "30d" (default: "30d")'),
    },
    async ({ domain_name, period }) => {
      try {
        const data = await client.get(
          `/api/domains/${encodeURIComponent(domain_name)}/uptime_summaries?period=${period}`
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
