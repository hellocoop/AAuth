export type RequireLevel = 'pseudonym' | 'identity' | 'auth-token' | 'approval' | 'interaction'

export interface AAuthChallenge {
  require: RequireLevel
  resourceToken?: string
  authServer?: string
  code?: string
}

/**
 * Parse an AAuth response header value into a structured challenge.
 *
 * Formats:
 *   AAuth: require=pseudonym
 *   AAuth: require=identity
 *   AAuth: require=auth-token; resource-token="..."; auth-server="https://..."
 *   AAuth: require=approval
 *   AAuth: require=interaction; code="ABCD1234"
 */
export function parseAAuthHeader(headerValue: string): AAuthChallenge {
  const trimmed = headerValue.trim()
  if (!trimmed) {
    throw new Error('Empty AAuth header')
  }

  // Parse the require= value (unquoted token)
  const requireMatch = trimmed.match(/^require=([a-z-]+)/)
  if (!requireMatch) {
    throw new Error('Missing require= in AAuth header')
  }

  const validLevels: RequireLevel[] = ['pseudonym', 'identity', 'auth-token', 'approval', 'interaction']
  const requireStr = requireMatch[1]
  if (!validLevels.includes(requireStr as RequireLevel)) {
    throw new Error(`Unknown require level: ${requireStr}`)
  }
  const require = requireStr as RequireLevel

  const challenge: AAuthChallenge = { require }

  // Parse semicolon-separated parameters
  const params = trimmed.slice(requireMatch[0].length)
  if (params.trim()) {
    const paramPairs = params.split(';').slice(1) // skip first empty segment
    for (const pair of paramPairs) {
      const eqIdx = pair.indexOf('=')
      if (eqIdx === -1) continue
      const key = pair.slice(0, eqIdx).trim()
      let value = pair.slice(eqIdx + 1).trim()
      // Strip quotes
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1)
      }
      switch (key) {
        case 'resource-token':
          challenge.resourceToken = value
          break
        case 'auth-server':
          challenge.authServer = value
          break
        case 'code':
          challenge.code = value
          break
      }
    }
  }

  // Validate required params for specific levels
  if (require === 'auth-token') {
    if (!challenge.resourceToken) {
      throw new Error('auth-token challenge missing resource-token')
    }
    if (!challenge.authServer) {
      throw new Error('auth-token challenge missing auth-server')
    }
  }

  if (require === 'interaction' && !challenge.code) {
    throw new Error('interaction challenge missing code')
  }

  return challenge
}
