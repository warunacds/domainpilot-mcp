import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { DomainPilotClient } from '../client.js';

export function registerMonitoringTools(server: McpServer, client: DomainPilotClient) {
  server.tool(
    'toggle_monitoring',
    'Enable or disable uptime monitoring for a domain',
    {
      domain_name: z.string().describe('The domain name (e.g., "example.com")'),
      enabled: z.boolean().describe('Set to true to enable monitoring, false to disable'),
    },
    async ({ domain_name, enabled }) => {
      try {
        const data = await client.post(
          `/api/domains/${encodeURIComponent(domain_name)}/toggle_uptime_monitoring`,
          { uptime_monitoring_enabled: enabled }
        );

        const action = enabled ? 'enabled' : 'disabled';
        return {
          content: [{
            type: 'text' as const,
            text: `Uptime monitoring ${action} for "${domain_name}".\n\n${JSON.stringify(data, null, 2)}`,
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
