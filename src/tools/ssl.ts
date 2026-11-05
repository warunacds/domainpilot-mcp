import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { DomainPilotClient } from '../client.js';

export function registerSslTools(server: McpServer, client: DomainPilotClient) {
  server.tool(
    'get_ssl_status',
    'Get the latest SSL certificate check for a domain (status, expiry date, days until expiry, issuer)',
    {
      domain_name: z.string().describe('The domain name (e.g., "example.com")'),
    },
    async ({ domain_name }) => {
      try {
        const data = await client.get<unknown[]>(
          `/api/domains/${encodeURIComponent(domain_name)}/ssl_checks?limit=1`
        );
        if (data.length === 0) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `No SSL checks recorded yet for ${domain_name}. SSL monitoring runs on paid tiers; check the domain's SSL tab in Domain Pilot.`,
              },
            ],
          };
        }
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(data[0], null, 2) }],
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
