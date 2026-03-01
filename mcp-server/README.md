# @aauth/mcp-server

Server-side AAuth for MCP. Verifies signed requests, validates agent and auth tokens, builds AAuth challenge headers, creates resource tokens, and manages 202 interaction flows.

See the [AAuth repo](https://github.com/hellocoop/AAuth) for protocol overview.

## Install

```bash
npm install @aauth/mcp-server
```

## Usage

### `verifyToken(options): Promise<VerifiedToken>`

Verifies a JWT from a signed request. Supports both `agent+jwt` and `auth+jwt` token types. Fetches issuer metadata and JWKS automatically (cached).

```ts
import { verifyToken } from '@aauth/mcp-server'

const result = await verifyToken({
  jwt: tokenFromSignatureKeyHeader,
  httpSignatureThumbprint: thumbprintFromVerifiedSignature,
})

if (result.type === 'agent') {
  // VerifiedAgentToken: iss, sub, cnf, iat, exp
  console.log(`Agent: ${result.sub}`)
}

if (result.type === 'auth') {
  // VerifiedAuthToken: iss, aud, agent, cnf, sub?, scope?, iat, exp
  console.log(`Authorized agent: ${result.agent}, scope: ${result.scope}`)
}
```

Throws `AAuthTokenError` with a spec-defined error code on failure:

| Code | Meaning |
|------|---------|
| `invalid_agent_token` | Agent token verification failed |
| `invalid_auth_token` | Auth token verification failed |
| `key_binding_failed` | Request signing key doesn't match token `cnf.jwk` |

### `buildAAuthHeader(require, params?): string`

Builds an `AAuth` response header for 401/403 challenges.

```ts
import { buildAAuthHeader } from '@aauth/mcp-server'

// 401 — require auth token
const header = buildAAuthHeader('auth-token', {
  resourceToken: '...',
  authServer: 'https://auth.example',
})
response.setHeader('AAuth', header)

// 403 — require interaction
const header = buildAAuthHeader('interaction', { code: 'ABCD1234' })

// Simple levels (no params)
buildAAuthHeader('pseudonym')
buildAAuthHeader('identity')
buildAAuthHeader('approval')
```

### `createResourceToken(options, sign): Promise<string>`

Creates a `resource+jwt` token for inclusion in 401 AAuth challenges.

```ts
import { createResourceToken } from '@aauth/mcp-server'

const resourceToken = await createResourceToken(
  {
    resource: 'https://api.example.com',
    authServer: 'https://auth.example',
    agent: 'https://user.github.io',
    agentJkt: thumbprint,  // JWK Thumbprint of agent's signing key
    scope: 'files.read',
    lifetime: 300,         // seconds, default 300
  },
  async (payload, header) => {
    // Sign the JWT with your resource server's key
    return signedJwtString
  }
)
```

### `InteractionManager`

Manages pending requests for 202 deferred response flows.

```ts
import { InteractionManager } from '@aauth/mcp-server'

const manager = new InteractionManager({
  baseUrl: 'https://api.example.com',
  pendingPath: '/pending',  // default
  codeLength: 8,            // default
  ttl: 600,                 // seconds, default
})

// Create a pending request (returns headers for 202 response)
const { headers, pending } = manager.createPending()
// headers: { Location, Retry-After, Cache-Control, AAuth }
// pending: { id, code, promise, resolve, reject }

// Resolve when the interaction completes
manager.resolve(pending.id, { granted: true })

// Or reject
manager.reject(pending.id, 'denied')

// Cleanup expired entries
manager.cleanup()
```

### `clearMetadataCache()`

Clears the cached issuer metadata and JWKS used by `verifyToken`.

```ts
import { clearMetadataCache } from '@aauth/mcp-server'

clearMetadataCache()
```

## License

MIT
