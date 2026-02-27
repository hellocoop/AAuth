import { fetch as httpSigFetch } from '@hellocoop/httpsig'
import { createSignedFetch } from './signed-fetch.js'
import { parseAAuthHeader } from './aauth-header.js'
import { exchangeToken } from './token-exchange.js'
import { pollDeferred } from './deferred.js'
import type { GetKeyMaterial, FetchLike } from './types.js'

export interface AAuthFetchOptions {
  getKeyMaterial: GetKeyMaterial
  onInteraction?: (code: string, endpoint: string) => void
  onClarification?: (question: string) => Promise<string>
  purpose?: string
  loginHint?: string
  tenant?: string
  domainHint?: string
}

interface CachedToken {
  authToken: string
  expiresAt: number
  authServer: string
}

/**
 * Create a protocol-aware fetch that handles the full AAuth challenge-response flow.
 *
 * Wraps createSignedFetch with:
 * 1. 401 AAuth challenge handling (token exchange + retry)
 * 2. 202 resource interaction (polling)
 * 3. Auth token caching by {resource origin, authServer}
 */
export function createAAuthFetch(options: AAuthFetchOptions): FetchLike {
  const {
    getKeyMaterial,
    onInteraction,
    onClarification,
    purpose,
    loginHint,
    tenant,
    domainHint,
  } = options

  const signedFetch = createSignedFetch(getKeyMaterial)
  const tokenCache = new Map<string, CachedToken>()

  return async (url: string | URL, init?: RequestInit): Promise<Response> => {
    const urlStr = typeof url === 'string' ? url : url.toString()
    const resourceOrigin = new URL(urlStr).origin

    // Check cache for a valid auth token for this resource
    const cached = findCachedToken(tokenCache, resourceOrigin)
    if (cached) {
      // Use cached auth token — sign with auth token instead of agent token
      const response = await fetchWithAuthToken(url, init, cached.authToken, getKeyMaterial)
      // If the cached token is rejected, fall through to challenge flow
      if (response.status !== 401) {
        return handleResourceInteraction(response, signedFetch, onInteraction, onClarification)
      }
      // Cached token rejected — remove and proceed with fresh exchange
      tokenCache.delete(cacheKey(resourceOrigin, cached.authServer))
    }

    // Send signed request (no auth token)
    const response = await signedFetch(url, init)

    // 200: success
    if (response.status === 200) {
      return response
    }

    // 401 with AAuth challenge: token exchange flow
    if (response.status === 401) {
      const aauthHeader = response.headers.get('aauth')
      if (!aauthHeader) {
        return response // Not an AAuth challenge
      }

      const challenge = parseAAuthHeader(aauthHeader)

      if (challenge.require === 'auth-token' && challenge.resourceToken && challenge.authServer) {
        const result = await exchangeToken({
          signedFetch,
          authServerUrl: challenge.authServer,
          resourceToken: challenge.resourceToken,
          purpose,
          loginHint,
          tenant,
          domainHint,
          onInteraction,
          onClarification,
        })

        // Cache the auth token
        const key = cacheKey(resourceOrigin, challenge.authServer)
        tokenCache.set(key, {
          authToken: result.authToken,
          expiresAt: Date.now() + result.expiresIn * 1000,
          authServer: challenge.authServer,
        })

        // Retry with auth token
        const retryResponse = await fetchWithAuthToken(
          url, init, result.authToken, getKeyMaterial,
        )
        return handleResourceInteraction(retryResponse, signedFetch, onInteraction, onClarification)
      }

      // pseudonymous/identity challenges don't require token exchange
      return response
    }

    // 202 with interaction: resource-level interaction
    return handleResourceInteraction(response, signedFetch, onInteraction, onClarification)
  }
}

/**
 * Handle 202 resource-level interaction by polling.
 */
async function handleResourceInteraction(
  response: Response,
  signedFetch: FetchLike,
  onInteraction?: (code: string, endpoint: string) => void,
  onClarification?: (question: string) => Promise<string>,
): Promise<Response> {
  if (response.status !== 202) {
    return response
  }

  const locationUrl = response.headers.get('location')
  if (!locationUrl) {
    return response // No Location → return as-is
  }

  let interactionCode: string | undefined
  const aauthHeader = response.headers.get('aauth')
  if (aauthHeader) {
    try {
      const challenge = parseAAuthHeader(aauthHeader)
      if (challenge.require === 'interaction' && challenge.code) {
        interactionCode = challenge.code
      }
    } catch {
      // Not a valid AAuth header — ignore
    }
  }

  const result = await pollDeferred({
    signedFetch,
    locationUrl,
    interactionCode,
    onInteraction,
    onClarification,
  })

  return result.response
}

/**
 * Send a signed request using the auth token as the signature key.
 * The auth token replaces the agent token in the Signature-Key header.
 */
async function fetchWithAuthToken(
  url: string | URL,
  init: RequestInit | undefined,
  authToken: string,
  getKeyMaterial: GetKeyMaterial,
): Promise<Response> {
  const { signingKey } = await getKeyMaterial()
  const response = await httpSigFetch(url, {
    ...init,
    signingKey,
    signatureKey: { type: 'jwt', jwt: authToken },
  })
  return response as Response
}

function cacheKey(resourceOrigin: string, authServer: string): string {
  return `${resourceOrigin}|${authServer}`
}

function findCachedToken(cache: Map<string, CachedToken>, resourceOrigin: string): CachedToken | undefined {
  for (const [key, cached] of cache) {
    if (key.startsWith(`${resourceOrigin}|`)) {
      // Check if still valid (with 60s buffer)
      if (cached.expiresAt > Date.now() + 60_000) {
        return cached
      }
      // Expired — remove
      cache.delete(key)
    }
  }
  return undefined
}
