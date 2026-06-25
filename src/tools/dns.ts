import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { DomainPilotClient } from '../client.js';

export function registerDnsTools(server: McpServer, client: DomainPilotClient) {
  server.tool(
    'get_dns_records',
    'List all DNS records for a domain',
    {
      domain_name: z.string().describe('The domain name (e.g., "example.com")'),
    },
    async ({ domain_name }) => {
      try {
        const data = await client.get(
          `/api/domains/${encodeURIComponent(domain_name)}/dns_records`
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
    'add_dns_record',
    'Add a DNS record to a domain',
    {
      domain_name: z.string().describe('The domain name (e.g., "example.com")'),
      record_type: z
        .enum(['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS'])
        .describe('The DNS record type'),
      name: z.string().describe('The record name (e.g., "@" for root, "www", "mail")'),
      value: z.string().describe('The record value (e.g., IP address, hostname, text)'),
      ttl: z
        .number()
        .optional()
        .describe('Time to live in seconds (optional)'),
      priority: z
        .number()
        .optional()
        .describe('Priority for MX records (optional)'),
    },
    async ({ domain_name, record_type, name, value, ttl, priority }) => {
      try {
        const dnsRecord: Record<string, unknown> = {
          record_type,
          name,
          value,
        };

        if (ttl !== undefined) {
          dnsRecord.ttl = ttl;
        }
        if (priority !== undefined) {
          dnsRecord.priority = priority;
        }

        const data = await client.post(
          `/api/domains/${encodeURIComponent(domain_name)}/dns_records`,
          { dns_record: dnsRecord }
        );
        return {
          content: [{
            type: 'text' as const,
            text: `DNS ${record_type} record added to "${domain_name}".\n\n${JSON.stringify(data, null, 2)}`,
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
    'update_dns_record',
    'Update an existing DNS record',
    {
      domain_name: z.string().describe('The domain name (e.g., "example.com")'),
      record_id: z.string().describe('The ID of the DNS record to update'),
      value: z.string().optional().describe('The new record value (optional)'),
      ttl: z.number().optional().describe('The new TTL in seconds (optional)'),
      priority: z.number().optional().describe('The new priority for MX records (optional)'),
    },
    async ({ domain_name, record_id, value, ttl, priority }) => {
      try {
        const dnsRecord: Record<string, unknown> = {};

        if (value !== undefined) {
          dnsRecord.value = value;
        }
        if (ttl !== undefined) {
          dnsRecord.ttl = ttl;
        }
        if (priority !== undefined) {
          dnsRecord.priority = priority;
        }

        const data = await client.patch(
          `/api/domains/${encodeURIComponent(domain_name)}/dns_records/${encodeURIComponent(record_id)}`,
          { dns_record: dnsRecord }
        );
        return {
          content: [{
            type: 'text' as const,
            text: `DNS record ${record_id} updated for "${domain_name}".\n\n${JSON.stringify(data, null, 2)}`,
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
    'acknowledge_dns_changes',
    'Acknowledge detected DNS changes for a domain',
    {
      domain_name: z.string().describe('The domain name (e.g., "example.com")'),
    },
    async ({ domain_name }) => {
      try {
        const data = await client.post(
          `/api/domains/${encodeURIComponent(domain_name)}/acknowledge_dns_changes`
        );
        return {
          content: [{
            type: 'text' as const,
            text: `DNS changes acknowledged for "${domain_name}".\n\n${JSON.stringify(data, null, 2)}`,
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
