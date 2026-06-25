import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { DomainPilotClient } from '../client.js';

interface Domain {
  id: number;
  name: string;
  online: boolean | null;
  health_grade: string | null;
  expires_at: string | null;
  uptime_monitoring_enabled: boolean;
  plan_disabled: boolean;
  auto_renew: boolean | null;
  registrar_name: string | null;
}

function formatDomainSummary(domain: Domain): string {
  const status = domain.plan_disabled
    ? 'Plan Disabled'
    : domain.uptime_monitoring_enabled
      ? domain.online === null
        ? 'Pending'
        : domain.online
          ? 'Online'
          : 'Offline'
      : 'Monitoring Off';

  const grade = domain.health_grade || 'N/A';
  const expiry = domain.expires_at
    ? new Date(domain.expires_at).toLocaleDateString()
    : 'Unknown';

  return `${domain.name} | ${status} | Grade: ${grade} | Expires: ${expiry}`;
}

export function registerDomainTools(server: McpServer, client: DomainPilotClient) {
  server.tool(
    'list_domains',
    'List all your domains with their current status, health grade, and monitoring state',
    {},
    async () => {
      try {
        const data = await client.get<Domain[]>('/api/domains');
        const domains = Array.isArray(data) ? data : [];

        if (domains.length === 0) {
          return {
            content: [{
              type: 'text' as const,
              text: 'You have no domains. Use the add_domain tool to add one.',
            }],
          };
        }

        const summary = domains.map(formatDomainSummary).join('\n');
        const online = domains.filter((d) => d.online === true).length;
        const offline = domains.filter((d) => d.online === false).length;

        const header = `${domains.length} domains total | ${online} online | ${offline} offline\n${'─'.repeat(60)}`;

        return {
          content: [{
            type: 'text' as const,
            text: `${header}\n${summary}`,
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

  server.tool(
    'get_domain',
    'Get detailed information about a specific domain including uptime, SSL, health, and expiry',
    {
      domain_name: z.string().describe('The domain name (e.g., "example.com")'),
    },
    async ({ domain_name }) => {
      try {
        const data = await client.get(`/api/domains/${encodeURIComponent(domain_name)}`);
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
    'add_domain',
    'Add a new domain to monitor',
    {
      domain_name: z.string().describe('The domain name to add (e.g., "example.com")'),
      auto_renew: z.boolean().optional().describe('Whether the domain auto-renews (optional)'),
    },
    async ({ domain_name, auto_renew }) => {
      try {
        const body: Record<string, unknown> = { name: domain_name };
        if (auto_renew !== undefined) {
          body.auto_renew = auto_renew;
        }

        const data = await client.post('/api/domains', { domain: body });
        return {
          content: [{
            type: 'text' as const,
            text: `Domain "${domain_name}" added successfully.\n\n${JSON.stringify(data, null, 2)}`,
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
