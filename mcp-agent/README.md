# @aauth/mcp-agent

Agent-side AAuth for MCP. Handles signed HTTP requests, AAuth challenge-response flows, token exchange with auth servers, and 202 deferred/interaction polling.

See the [AAuth repo](https://github.com/hellocoop/AAuth) for protocol overview.

## Install

```bash
npm install @aauth/mcp-agent
```

## Usage

### `createAAuthFetch(options): FetchLike`

Creates a protocol-aware fetch that handles the full AAuth flow automatically: signs requests, parses 401 challenges, exchanges tokens with the auth server, caches auth tokens, and retries.

```ts
import { createAAuthFetch } from '@aauth/mcp-agent'

const fetch = createAAuthFetch({
  getKeyMaterial: async () => ({
    signingKey: privateKeyJwk,
    signatureKey: { type: 'jwt', jwt: agentToken }
  }),
  // Optional callbacks
  onInteraction: (code, endpoint) => {
    console.log(`Visit ${endpoint} and enter code: ${code}`)
  },
  onClarification: async (question) => {
    return prompt(question)
  },
  // Optional hints for the auth server
  purpose: 'Read project files',
  loginHint: 'user@example.com',
  tenant: 'acme.com',
  domainHint: 'acme.com',
})

const response = await fetch('https://resource.example/api')
```

### `createSignedFetch(getKeyMaterial): FetchLike`

Creates a fetch that signs requests with HTTP Message Signatures but does not handle AAuth challenges. Use this when you only need request signing.

```ts
import { createSignedFetch } from '@aauth/mcp-agent'

const signedFetch = createSignedFetch(async () => ({
  signingKey: privateKeyJwk,
  signatureKey: { type: 'hwk' }
}))
```

### `parseAAuthHeader(headerValue): AAuthChallenge`

Parses an `AAuth` response header into a structured challenge.

```ts
import { parseAAuthHeader } from '@aauth/mcp-agent'

const challenge = parseAAuthHeader(response.headers.get('AAuth'))
// { require: 'auth-token', resourceToken: '...', authServer: 'https://...' }
```

Returns:

```ts
interface AAuthChallenge {
  require: 'pseudonym' | 'identity' | 'auth-token' | 'approval' | 'interaction'
  resourceToken?: string
  authServer?: string
  code?: string
}
```

### `exchangeToken(options): Promise<TokenExchangeResult>`

Exchanges a resource token for an auth token at the auth server. Handles metadata discovery, 202 deferred responses, and interaction polling.

```ts
import { exchangeToken } from '@aauth/mcp-agent'

const { authToken, expiresIn } = await exchangeToken({
  signedFetch,
  authServerUrl: 'https://auth.example',
  resourceToken: '...',
  purpose: 'Read project files',
})
```

### `pollDeferred(options): Promise<DeferredResult>`

Polls a 202 Location URL until a terminal response. Handles `Retry-After`, `Prefer: wait`, clarification chat, and interaction codes.

```ts
import { pollDeferred } from '@aauth/mcp-agent'

const { response, error } = await pollDeferred({
  signedFetch,
  locationUrl: 'https://auth.example/pending/abc123',
  interactionCode: 'ABCD1234',
  onInteraction: (code, endpoint) => { /* show to user */ },
  maxPollDuration: 300, // seconds, default 300
})
```

## Key Material Callback

All signing functions take a `GetKeyMaterial` callback. This decouples key management from the protocol — you provide keys however you want:

```ts
type GetKeyMaterial = () => Promise<{
  signingKey: JsonWebKey          // Ed25519 private key for HTTP signatures
  signatureKey:
    | { type: 'jwt', jwt: string }  // agent or auth token
    | { type: 'hwk' }               // bare public key (pseudonym)
}>
```

For local development, use [`@aauth/local-keys`](../local-keys) to provide this callback from the OS keychain.

## License

MIT
