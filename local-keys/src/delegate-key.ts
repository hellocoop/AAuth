import { signAgentToken } from './agent-token.js'
import type { CreateAgentTokenOptions, AgentTokenResult } from './types.js'

interface CacheEntry {
  result: AgentTokenResult
  expiresAt: number
}

const cache = new Map<string, CacheEntry>()

export async function createAgentToken(
  options: CreateAgentTokenOptions,
): Promise<AgentTokenResult> {
  const { agentUrl, delegate, tokenLifetime = 3600 } = options
  const delegateUrl = `${agentUrl.replace(/\/$/, '')}/${delegate}`
  const cacheKey = `${agentUrl}::${delegate}`

  const cached = cache.get(cacheKey)
  if (cached) {
    const now = Math.floor(Date.now() / 1000)
    if (now < cached.expiresAt) {
      return cached.result
    }
  }

  const result = await signAgentToken({
    agentUrl,
    delegateUrl,
    lifetime: tokenLifetime,
  })

  const now = Math.floor(Date.now() / 1000)
  cache.set(cacheKey, {
    result,
    expiresAt: now + Math.floor(tokenLifetime * 0.8),
  })

  return result
}
