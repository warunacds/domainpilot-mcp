import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { DomainPilotClient, ApiError } from '../client.js';

export function registerAiAnalysisTools(server: McpServer, client: DomainPilotClient) {
  server.tool(
    'get_ai_analysis',
    'Get the latest AI-powered analysis for a domain with findings and recommendations. Can optionally regenerate if a free generation is available.',
    {
      domain_name: z.string().describe('The domain name (e.g., "example.com")'),
      regenerate: z
        .boolean()
        .optional()
        .default(false)
        .describe('Set to true to regenerate the analysis (may require payment)'),
    },
    async ({ domain_name, regenerate }) => {
      try {
        if (regenerate) {
          try {
            const data = await client.post(
              `/api/domains/${encodeURIComponent(domain_name)}/ai_analyses/generate`
            );
            return {
              content: [{
                type: 'text' as const,
                text: `AI analysis regenerated for "${domain_name}".\n\n${JSON.stringify(data, null, 2)}`,
              }],
            };
          } catch (error) {
            if (error instanceof ApiError && error.status === 402) {
              return {
                content: [{
                  type: 'text' as const,
                  text: `This requires a $2 payment. Please regenerate from the web app at domainpilot.io/domains/${encodeURIComponent(domain_name)}/ai-analysis`,
                }],
              };
            }
            throw error;
          }
        }

        const data = await client.get(
          `/api/domains/${encodeURIComponent(domain_name)}/ai_analyses/latest`
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
