import {
  InvalidTokenError,
  ServerError,
} from '@modelcontextprotocol/sdk/server/auth/errors.js';
import type { OAuthTokenVerifier } from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';

interface TokenInfo {
  user_id: number;
  expires_at: string | null;
  scopes: string[];
}

// Static dp_mcp_ tokens never expire, but the SDK's bearer middleware requires
// a numeric expiry, so they are treated as valid for the next hour.
const STATIC_TOKEN_TTL_SECONDS = 60 * 60;
const TOKEN_INFO_TIMEOUT_MS = 10_000;

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : 'unknown error';
}

// Logs only the reason (status code or error name), never the token.
function verificationFailure(reason: string): ServerError {
  console.error(`Token verification failed: ${reason}`);
  return new ServerError(`Token verification failed (${reason})`);
}

/**
 * Verifies bearer tokens (OAuth access tokens and static MCP tokens) against
 * the Domain Pilot API's token_info endpoint.
 *
 * Only a 401 from the API throws InvalidTokenError, which asks the client to
 * sign in again. Every other failure throws ServerError (500), so an API outage
 * or a malformed response does not send clients into a re-authorization loop.
 */
export function createTokenVerifier(apiUrl: string): OAuthTokenVerifier {
  return {
    async verifyAccessToken(token: string): Promise<AuthInfo> {
      let response: Response;

      try {
        response = await fetch(`${apiUrl}/api/v1/mcp/token_info`, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
          signal: AbortSignal.timeout(TOKEN_INFO_TIMEOUT_MS),
        });
      } catch (error) {
        throw verificationFailure(errorName(error));
      }

      if (response.status === 401) {
        throw new InvalidTokenError('Invalid or expired token');
      }

      if (!response.ok) {
        throw verificationFailure(`HTTP ${response.status}`);
      }

      const info = (await response.json().catch((error: unknown) => {
        throw verificationFailure(errorName(error));
      })) as TokenInfo;

      let expiresAt: number;

      if (info.expires_at === null) {
        expiresAt = Math.floor(Date.now() / 1000) + STATIC_TOKEN_TTL_SECONDS;
      } else {
        expiresAt = Math.floor(Date.parse(info.expires_at) / 1000);

        if (Number.isNaN(expiresAt)) {
          throw verificationFailure('unparseable expires_at');
        }
      }

      return {
        token,
        clientId: '',
        scopes: info.scopes,
        expiresAt,
        extra: { userId: info.user_id },
      };
    },
  };
}
