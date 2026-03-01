# @aauth/local-keys

Local development key management for AAuth. Generates Ed25519 key pairs, stores them in the OS keychain, and creates agent tokens for delegates.

See the [AAuth repo](https://github.com/hellocoop/AAuth) for protocol overview.

## Install

```bash
npm install @aauth/local-keys
```

## CLI

```bash
# Generate a key pair and store in OS keychain
npx @aauth/local-keys https://yourusername.github.io

# List all stored agent URLs and keys
npx @aauth/local-keys

# Show setup skill instructions
npx @aauth/local-keys skill
```

After generating a key, publish the public JWK to your GitHub Pages site at `/.well-known/jwks.json`. See the included [setup skill](./skills/github.io.md) for step-by-step instructions.

## API

### `generateKey(): Promise<GeneratedKeyPair>`

Generates an Ed25519 key pair with a date-based `kid`.

```ts
import { generateKey } from '@aauth/local-keys'

const { privateJwk, publicJwk, kid } = await generateKey()
// kid: "2026-03-01_a3f"
```

### `writeKeychain(agentUrl, data)`

Stores key material in the OS keychain.

```ts
import { writeKeychain } from '@aauth/local-keys'

writeKeychain('https://user.github.io', {
  rootPrivateJwk: privateJwk,
  rootPublicJwk: publicJwk,
  kid: '2026-03-01_a3f',
})
```

### `readKeychain(agentUrl): KeychainData | null`

Reads key material from the OS keychain.

```ts
import { readKeychain } from '@aauth/local-keys'

const keys = readKeychain('https://user.github.io')
if (keys) {
  const { rootPrivateJwk, rootPublicJwk, kid } = keys
}
```

### `listAgentUrls(): string[]`

Lists all agent URLs with stored keys.

```ts
import { listAgentUrls } from '@aauth/local-keys'

const urls = listAgentUrls()
// ['https://user.github.io']
```

### `createAgentToken(options): Promise<AgentTokenResult>`

Generates an ephemeral key pair, creates an `agent+jwt` signed by the root key, and returns everything needed for `@aauth/mcp-agent`'s `getKeyMaterial` callback.

```ts
import { createAgentToken } from '@aauth/local-keys'

const { agentToken, ephemeralPrivateJwk, ephemeralPublicJwk } = await createAgentToken({
  agentUrl: 'https://user.github.io',
  delegateUrl: 'https://user.github.io/claude',
  rootPrivateJwk,
  rootKid: '2026-03-01_a3f',
  lifetime: 3600, // seconds, default 3600
})
```

### `signAgentToken(options): Promise<string>`

Signs an `agent+jwt` with the root key. Lower-level than `createAgentToken` — use when you already have an ephemeral key.

```ts
import { signAgentToken } from '@aauth/local-keys'

const jwt = await signAgentToken({
  agentUrl: 'https://user.github.io',
  delegateUrl: 'https://user.github.io/claude',
  ephemeralPublicJwk,
  rootPrivateJwk,
  rootKid: '2026-03-01_a3f',
  lifetime: 3600,
})
```

### `toPublicJwk(jwk): JWK`

Extracts the public key from a JWK (strips the private `d` parameter).

```ts
import { toPublicJwk } from '@aauth/local-keys'

const pub = toPublicJwk(privateJwk)
```

## Key Storage

Uses [`@napi-rs/keyring`](https://www.npmjs.com/package/@napi-rs/keyring) for OS keychain access:

| Platform | Backend |
|----------|---------|
| macOS | Keychain (Security.framework) |
| Windows | Credential Manager |
| Linux | Secret Service API (gnome-keyring, KWallet) |

## License

MIT
