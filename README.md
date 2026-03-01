# AAuth — Agent Auth for MCP

TypeScript packages for adding [AAuth](https://github.com/DickHardt/draft-hardt-aauth) (Agent Auth) to MCP servers and agents.

AAuth is an agent-aware authentication protocol that lets AI agents prove their identity and obtain authorization using HTTP Message Signatures and JWTs.

## Packages

| Package | Description |
|---------|-------------|
| [`@aauth/mcp-agent`](./mcp-agent) | Agent-side AAuth: signed fetch, challenge-response, token exchange |
| [`@aauth/mcp-server`](./mcp-server) | Server-side AAuth: token verification, challenge building, resource tokens |
| [`@aauth/local-keys`](./local-keys) | Local dev key management via OS keychain |
| [`@aauth/mcp-stdio`](./mcp-stdio) | stdio-to-HTTP proxy with AAuth signatures |
| [`@aauth/mcp-openclaw`](./mcp-openclaw) | OpenClaw plugin for AAuth-authenticated MCP connections |

## How It Works

```
Agent                          Resource Server              Auth Server
  │                                  │                          │
  ├─── signed request ──────────────►│                          │
  │                                  │                          │
  │◄── 401 + resource_token ────────┤                          │
  │         + auth-server URL        │                          │
  │                                  │                          │
  ├─── signed POST (resource_token) ────────────────────────────►│
  │                                                             │
  │◄── auth_token ─────────────────────────────────────────────┤
  │                                  │                          │
  ├─── signed request ──────────────►│                          │
  │    + auth_token                  │                          │
  │                                  ├── verify signature       │
  │                                  ├── verify auth_token      │
  │                                  ├── check key binding      │
  │◄── 200 OK ──────────────────────┤                          │
```

1. Agent sends a signed HTTP request to the resource server
2. Resource responds with 401 + a `resource_token` and auth server URL
3. Agent exchanges the `resource_token` at the auth server (signed request)
4. Auth server returns an `auth_token` (or 202 for interactive flows)
5. Agent retries with the `auth_token` — resource verifies signature, token, and key binding

All requests are signed with [HTTP Message Signatures](https://www.rfc-editor.org/rfc/rfc9421) (RFC 9421) using Ed25519. Tokens are JWTs with `agent+jwt`, `auth+jwt`, and `resource+jwt` types.

## Quick Start

### Agent side

```ts
import { createAAuthFetch } from '@aauth/mcp-agent'

const fetch = createAAuthFetch({
  getKeyMaterial: async () => ({
    signingKey: privateKeyJwk,
    signatureKey: { type: 'jwt', jwt: agentToken }
  })
})

const response = await fetch('https://resource.example/api')
// Handles 401 challenges, token exchange, and retry automatically
```

### Server side

```ts
import { verifyToken, buildAAuthHeader, createResourceToken } from '@aauth/mcp-server'

// Verify an incoming signed request's token
const result = await verifyToken({ jwt, httpSignatureThumbprint })

// Build a 401 challenge
const header = buildAAuthHeader('auth-token', { resourceToken, authServer })

// Create a resource token for the challenge
const token = await createResourceToken({ resource, authServer, agent, agentJkt }, sign)
```

### Local development

```bash
# Generate a key pair and store in OS keychain
npx @aauth/local-keys https://yourusername.github.io
```

## Specification

The AAuth protocol specification: [github.com/DickHardt/draft-hardt-aauth](https://github.com/DickHardt/draft-hardt-aauth)

## License

MIT
