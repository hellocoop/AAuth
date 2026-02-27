type RequireLevel = 'pseudonym' | 'identity' | 'auth-token' | 'approval' | 'interaction'

/**
 * Build an AAuth response header value per the AAuth spec.
 *
 * Overloads:
 *   buildAAuthHeader('pseudonym')          → 'require=pseudonym'
 *   buildAAuthHeader('identity')           → 'require=identity'
 *   buildAAuthHeader('auth-token', {...})  → 'require=auth-token; resource-token="..."; auth-server="..."'
 *   buildAAuthHeader('approval')           → 'require=approval'
 *   buildAAuthHeader('interaction', {...}) → 'require=interaction; code="..."'
 */
export function buildAAuthHeader(require: 'pseudonym'): string
export function buildAAuthHeader(require: 'identity'): string
export function buildAAuthHeader(require: 'auth-token', params: { resourceToken: string; authServer: string }): string
export function buildAAuthHeader(require: 'approval'): string
export function buildAAuthHeader(require: 'interaction', params: { code: string }): string
export function buildAAuthHeader(
  require: RequireLevel,
  params?: { resourceToken?: string; authServer?: string; code?: string },
): string {
  switch (require) {
    case 'pseudonym':
      return 'require=pseudonym'

    case 'identity':
      return 'require=identity'

    case 'approval':
      return 'require=approval'

    case 'auth-token': {
      if (!params?.resourceToken || !params?.authServer) {
        throw new Error('auth-token requires resourceToken and authServer')
      }
      return `require=auth-token; resource-token="${params.resourceToken}"; auth-server="${params.authServer}"`
    }

    case 'interaction': {
      if (!params?.code) {
        throw new Error('interaction requires code')
      }
      return `require=interaction; code="${params.code}"`
    }

    default:
      throw new Error(`Unknown require level: ${require}`)
  }
}
