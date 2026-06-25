import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { DomainPilotClient } from '../client.js';

export function registerDashboardTools(server: McpServer, client: DomainPilotClient) {
  server.tool(
    'get_dashboard_stats',
    'Get an overview of your domain portfolio — total domains, online count, expiring, alerts',
    {},
    async () => {
      try {
        const data = await client.get('/api/dashboard/stats');
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
