# AAuth Architecture

## What This Is

Utilities and packages for adding AAuth (Agent Auth) to MCP servers and agents.

**Spec:** [github.com/DickHardt/agent-auth](https://github.com/DickHardt/agent-auth)
**Reference impl (Python):** [github.com/HelloCoop/aauth-implementation](https://github.com/HelloCoop/aauth-implementation)
**HTTP Message Signing:** [github.com/HelloCoop/packages-js/httpsig](https://github.com/HelloCoop/packages-js/tree/main/httpsig) (`@hellocoop/httpsig`)

---

## Core Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| Algorithm | Ed25519 / EdDSA | Required by spec, compact, fast |
| HTTP Signatures | `@hellocoop/httpsig` | RFC 9421, zero deps, AAuth profile, already built |
| JWT library | `jose` | Supports EdDSA/OKP, well maintained, pure JS |
| Key storage (local) | `@napi-rs/keyring` | OS keychain, no fallback, fail at install |
| Authorization | Scopes first | Simple, sufficient for initial integrations |
| Identity anchor | GitHub Pages `.well-known/` | Verifiable, no infrastructure needed |
| URL convention | No trailing slash | Per spec: `https://example.com` not `https://example.com/` |

---

## Key Libraries

### `@hellocoop/httpsig`

The HTTP message signing library in `packages-js/httpsig` handles the bulk of the protocol mechanics:

- **RFC 9421** HTTP Message Signatures with AAuth profile enforcement
- **Ed25519 and ES256** algorithm support
- **All three Signature-Key schemes**: `hwk` (pseudonym), `jwt` (agent/auth token), `jwks_uri` (identity discovery)
- **Signed `fetch()`** — wraps standard fetch, adds Signature, Signature-Input, Signature-Key headers
- **`verify()`** — validates signatures, returns key type, public key, JWK thumbprint
- **Framework helpers** — Express, Fastify, Next.js adapters
- **JWK Thumbprint** (RFC 7638) built in
- **JWKS discovery and caching** for `jwks_uri` scheme
- **Content-Digest** (RFC 9530) for body integrity
- **Zero dependencies**, pure TypeScript

**Signing a request:**
```ts
import { fetch } from '@hellocoop/httpsig'

const response = await fetch('https://resource.example/api', {
  method: 'GET',
  signingKey: privateKeyJwk,
  signatureKey: { type: 'hwk' },  // or 'jwt' or 'jwks_uri'
})
```

**Verifying a request:**
```ts
import { verify } from '@hellocoop/httpsig'

const result = await verify(
  { method, authority, path, headers, body },
  { strictAAuth: true }
)
// result: { verified, keyType, publicKey, thumbprint, jwt?, jwks_uri? }
```

### `jose`

Used for JWT token operations (creating and verifying agent, resource, and auth tokens). The httpsig library handles HTTP-level signing; `jose` handles JWT-level operations.

---

## Agent Identity

An agent's identity is an HTTPS URL. For developers, GitHub Pages provides a zero-infrastructure way to publish one:

```
https://<user>.github.io/.well-known/aauth-agent.json
https://<user>.github.io/.well-known/jwks.json
```

Trust model: only the GitHub account owner can publish to their `*.github.io` site.

### Delegation Model

The GitHub Pages URL is the **agent server** identity. Each runtime (OpenClaw instance, Claude Code session, etc.) is a **delegate** identified by a sub-path:

```
Agent server:    https://dickhardt.github.io
Delegates:       https://dickhardt.github.io/openclaw
                 https://dickhardt.github.io/claude
```

The agent server's root key (long-lived, in OS keychain for local dev) signs agent tokens for delegates. Delegates carry only short-lived agent tokens with their own ephemeral keys.

```
Root Key at https://dickhardt.github.io
  └─ signs Agent Token for delegate
       ├─ sub: "https://dickhardt.github.io/openclaw"
       └─ cnf.jwk: delegate's ephemeral public key
            └─ delegate signs HTTP requests with ephemeral private key
```

The delegate URI defaults to `<agent-server>/<runtime>` but can be overridden in config.

---

## Package Architecture

```
@aauth/
├── mcp-agent       — MCP agent: calls MCP servers with AAuth
│                     Callback-based: caller provides key material
├── mcp-server      — MCP server: validates AAuth on incoming requests
│                     Scope enforcement, challenge issuance
├── local-keys      — Local key management: OS keychain via @napi-rs/keyring
│                     Reads root key, signs/refreshes agent tokens
├── mcp-stdio       — stdio wrapper for Claude Code etc.
│                     Includes setup (key gen, GitHub Pages scaffolding)
└── mcp-openclaw    — OpenClaw plugin
│                     Includes setup (key gen, GitHub Pages scaffolding)
```

### Dependencies

| Package | Key Deps |
|---------|----------|
| `@aauth/mcp-agent` | `@hellocoop/httpsig`, `jose` |
| `@aauth/mcp-server` | `@hellocoop/httpsig`, `jose` |
| `@aauth/local-keys` | `@napi-rs/keyring`, `jose` |
| `@aauth/mcp-stdio` | `@aauth/mcp-agent`, `@aauth/local-keys` |
| `@aauth/mcp-openclaw` | `@aauth/mcp-agent`, `@aauth/mcp-server`, `@aauth/local-keys` |

All packages: Node.js, ESM, TypeScript.

### Key Management Model

`@aauth/mcp-agent` takes a **callback** to get key material. It never manages keys itself.

```ts
const agent = createAgent({
  getSignatureKey: async () => ({
    signingKey: privateKeyJwk,
    signatureKey: { type: 'jwt', jwt: agentToken }
  })
})
```

The caller decides where keys come from:

| Environment | Key source | Callback provided by |
|-------------|-----------|---------------------|
| Local dev | OS keychain | `@aauth/local-keys` |
| Single process at a domain | Ephemeral key at startup | The process itself |
| Production infrastructure | Cloud KMS, Vault, etc. | Infra-specific code |

### `@aauth/local-keys`

Handles key management for **local development** — the only package with `@napi-rs/keyring`:

- Reads/writes the root private key from OS keychain
- Generates ephemeral delegate key pairs
- Signs agent tokens for delegates (root key signs token containing delegate's `cnf.jwk`)
- Refreshes agent tokens before expiry
- Provides a callback compatible with `@aauth/mcp-agent`

### What each layer does

**`@hellocoop/httpsig`** handles:
- HTTP Message Signing (RFC 9421) — sign and verify
- Signature-Key header (hwk, jwt, jwks_uri schemes)
- JWK Thumbprint (RFC 7638)
- Content-Digest (RFC 9530)
- JWKS discovery and caching
- Signed `fetch()` wrapper

**`jose`** handles:
- JWT creation (SignJWT) and verification (jwtVerify)
- JWK import/export
- EdDSA/Ed25519 key operations

**`@aauth/mcp-agent`** adds:
- AAuth challenge parsing (SF Dictionary from 401 responses)
- Token exchange flow with auth server (resource_token → auth_token)
- 202 polling engine with Prefer: wait, Retry-After, clarification chat
- Protocol-aware `createAAuthFetch` — handles full challenge-response + caching
- Token caching and refresh
- Callback-based: never touches key storage

**`@aauth/mcp-server`** adds:
- AAuth challenge building (`require=` SF Dictionary response headers)
- Resource token creation and signing
- Pending request management (InteractionManager for 202 flows)
- Auth token validation (issuer, audience, scope, cnf binding)
- Scope enforcement

**`@aauth/local-keys`** adds:
- OS keychain read/write via `@napi-rs/keyring`
- Agent token creation and refresh (signs with root key from keychain)
- Key generation (Ed25519 via `jose`)
- GitHub Pages scaffolding (`.well-known/` files, `.nojekyll`)

---

## Integration Targets

### 1. stdio Wrapper (`@aauth/mcp-stdio`)

For agents that use stdio transport (Claude Code, other CLI agents), a wrapper process adds AAuth:

```
Claude Code (stdio)
  → @aauth/mcp-stdio (stdio ↔ HTTP bridge)
    → AAuth MCP Server (HTTP)
```

The wrapper:
- Speaks stdio (JSON-RPC) to the client
- Speaks HTTP + AAuth to the upstream MCP server via `@aauth/mcp-agent`
- Uses `@aauth/local-keys` for key management when running locally
- Agent identity comes from GitHub Pages
- **Includes setup**: first run generates keys, stores in keychain, scaffolds GitHub Pages

**Env vars** configure the wrapper:
```
AAUTH_MCP_SERVER=https://files-api.example.com/mcp
AAUTH_AGENT_URL=https://dickhardt.github.io
AAUTH_DELEGATE=claude       # optional, defaults to "claude"
```

### 2. OpenClaw Plugin (`@aauth/mcp-openclaw`)

OpenClaw uses an in-process plugin system. The AAuth plugin:

- Registers tools via `api.registerTool()` — bridges remote AAuth-protected MCP servers into OpenClaw's native tool system
- Reads MCP server URLs from plugin config
- Connects to each MCP server, discovers tools via MCP `tools/list`
- Wraps each tool's `execute` handler with `@aauth/mcp-agent` for signing and challenge handling
- Uses `@aauth/local-keys` for key management when running locally
- Bundles a `skills/aauth/SKILL.md` with setup and usage instructions
- **Includes setup**: first run generates keys, stores in keychain, scaffolds GitHub Pages

**Plugin config** in `~/.openclaw/openclaw.json`:
```json5
{
  plugins: {
    entries: {
      "aauth": {
        enabled: true,
        config: {
          agent_url: "https://dickhardt.github.io",
          delegate: "openclaw",  // optional, defaults to "openclaw"
          mcp_servers: {
            "my-files": "https://files-api.example.com/mcp",
            "my-db": "https://db-api.example.com/mcp"
          }
        }
      }
    }
  }
}
```

No scopes in the config — the resource tells the agent what scopes are needed via AAuth challenges and resource tokens.

**How it works at runtime:**
```
LLM calls tool "my_files_read"
  → AAuth plugin execute() handler
    → mcp-agent calls httpsig fetch() to https://files-api.example.com/mcp
    → if 401 + AAuth challenge:
        → mcp-agent parses resource-token and auth-server
        → exchanges resource_token with auth server (with 202/polling if needed)
        → retries with auth_token
    → returns result to LLM
```

**Plugin structure:**
```
@aauth/mcp-openclaw/
├── openclaw.plugin.json     — Plugin manifest (id, configSchema, uiHints)
├── src/
│   └── index.ts             — Plugin entry: register(api) → registerTool() per MCP server
├── skills/
│   └── aauth/
│       └── SKILL.md         — Setup instructions, install steps, usage guidance
└── package.json
```

---

## Protocol Flow (Scopes)

Starting with the simplest authorization flow — scopes only, no RAR.

### Agent → Resource (with auth)

```
1. Agent → Resource (httpsig fetch, callback provides signatureKey)
2. Resource → 401 + AAuth header:
     require=auth-token; resource-token="..."; auth-server="https://auth.example"
3. Agent → Auth Server (POST with resource_token, signed request, Prefer: wait=45)
4. Auth Server → Agent (auth_token with scope + cnf.jwk)
     Or 202 + Location + interaction code → agent polls until terminal
5. Agent → Resource (httpsig fetch, signatureKey: { type: 'jwt', jwt: auth_token })
6. Resource validates (via @hellocoop/httpsig verify + jose jwtVerify):
     - Auth server signature on auth token
     - cnf.jwk matches request signature (thumbprint comparison)
     - scope covers requested operation
7. Resource → 200 OK
```

### Tokens (all EdDSA, `"alg": "EdDSA"`)

**Resource Token** (`typ: "resource+jwt"`) — issued by resource:
```json
{
  "iss": "https://resource.example",
  "aud": "https://auth.example",
  "agent": "https://dickhardt.github.io",
  "agent_jkt": "<JWK Thumbprint of agent's current key>",
  "scope": "files.read",
  "exp": 1234567890
}
```

**Auth Token** (`typ: "auth+jwt"`) — issued by auth server:
```json
{
  "iss": "https://auth.example",
  "aud": "https://resource.example",
  "agent": "https://dickhardt.github.io",
  "agent_delegate": "https://dickhardt.github.io/openclaw",
  "cnf": { "jwk": { "kty": "OKP", "crv": "Ed25519", "x": "..." } },
  "scope": "files.read",
  "exp": 1234567890
}
```

---

## Phased Build

### Phase 1: `@aauth/mcp-agent`

- AAuth challenge parsing (`require=` SF Dictionary format)
- Token exchange flow (resource_token → auth_token via auth server)
- 202 polling engine (Prefer: wait, Retry-After, clarification chat)
- Protocol-aware `createAAuthFetch` — full challenge-response + caching
- Token caching and refresh
- Callback-based key API
- Built on `@hellocoop/httpsig` (signing/fetch) and `jose` (JWTs)

### Phase 2: `@aauth/local-keys`

- OS keychain access via `@napi-rs/keyring`
- Ed25519 key generation via `jose`
- Agent token signing and refresh
- GitHub Pages scaffolding (`.well-known/` files)
- Provides callback for `@aauth/mcp-agent`

### Phase 3: `@aauth/mcp-server`

Building blocks available now: `buildAAuthHeader`, `InteractionManager`, `createResourceToken`.

Future: Two high-level exports: `createAAuthMcpServer` (simple wrapper) and `createAAuth` (composable core).

**Simple server (greenfield):**
```ts
import { createAAuthMcpServer } from '@aauth/mcp-server'

const server = createAAuthMcpServer({
  name: 'acme-tools',
  version: '1.0.0',
  resource: 'https://tools.acme.com',
  authServer: 'https://auth.hello.coop',
  authorize: (ctx) => ctx.tenant === 'acme.com',
})
server.tool('read_file', { path: z.string() }, async ({ path }, extra) => { ... })
server.listen(3000)
```

Handles AAuth verification, `.well-known/aauth-resource` + `jwks.json`, CORS, transport, 401/403 challenges.

**Composable core (existing servers like Freezer):**
```ts
import { createAAuth } from '@aauth/mcp-server'

const aauth = createAAuth({
  resource: 'https://freezer.hello.coop',
  authServer: 'https://auth.hello.coop',
  authorize: (ctx) => ctx.tenant === 'hello.coop',
})
```

Components:
- `aauth.authenticate(req)` → `{ status: 'verified', authInfo }` | `{ status: 'not-aauth' }` | `{ status: 'invalid' }`
- `aauth.authorize(authResult, body)` → `true` | `string[]` (missing scopes)
- `aauth.challenge()` → `AAuth` header value for 401
- `aauth.scopeChallenge(scopes)` → `AAuth` header value for 403
- `aauth.serveMetadata(req, res)` → serves `.well-known` routes, returns `true` if handled

`authorize` callback receives `AuthorizeContext`:
```ts
interface AuthorizeContext {
  agent: string                  // agent URL
  delegate?: string              // delegate identifier
  authLevel: 'pseudonym' | 'identified' | 'authorized'
  user?: string                  // sub claim from auth token
  tenant?: string                // tenant from auth token
  scopes?: string[]              // granted scopes
  tool?: {                       // extracted from JSON-RPC body (null if not tools/call)
    name: string
    arguments: Record<string, unknown>
  }
}
```

Returns `true` (allowed) or `string[]` (required scopes → 403 with scope challenge).

**Design principles:**
- Does NOT replace or implement OAuth — only adds AAuth verification
- Developer composes AAuth alongside their existing OAuth/shared-secret auth
- Developer controls the 401/403 response — sets both `AAuth` and `WWW-Authenticate` headers themselves
- Populates MCP SDK's `authInfo` on `transport.handleRequest()` — tools access via `extra.authInfo`

**Full `createAAuth` options:**
```ts
createAAuth({
  resource: 'https://freezer.hello.coop',
  authServer: 'https://auth.hello.coop',

  // Scope descriptions — served in /.well-known/aauth-resource.json
  // Included in resource tokens on 401 challenges; auth server shows descriptions during consent
  // Auth server — defaults to 'https://issuer.hello.coop'
  // authServer: 'https://auth.enterprise.com',

  // Scope descriptions with human-readable text — served in /.well-known/aauth-resource.json
  // Identity scopes (OIDC: openid, email) and authorization scopes (resource-specific)
  // Auth server shows descriptions during consent
  scope_descriptions: {
    'openid': 'Identify who you are',
    'logs:read': 'Read and query log events',
    'infra:read': 'View infrastructure health and metrics',
    'infra:admin': 'Modify infrastructure settings',
  },

  // Authorization callback — returns true (allowed) or string[] (missing scopes → 403)
  authorize: (ctx) => ctx.tenant === 'hello.coop',

  // Resource token signing
  // Production: bring your own signer (KMS, Vault, etc.) + public key for JWKS
  sign: async (payload) => signedJwtString,
  publicKey: { kty: 'OKP', crv: 'Ed25519', x: '...', kid: 'key-1' },
  // Dev: omit both → ephemeral in-memory Ed25519 keypair generated at startup
})
```

Resource tokens (typ: `resource+jwt`) are signed with the server's key and include:
`iss` (resource URL), `aud` (auth server URL), `agent` (agent identifier),
`agent_jkt` (JWK thumbprint of agent's signing key), `scope`, `exp`.

Scopes in the resource token:
- On **401** (no auth): all declared scopes — auth server can grant any subset
- On **403** (insufficient scope): `authorize` returns specific missing scopes for the challenge

Scopes can be identity scopes (OIDC: `openid`, `email`) or authorization scopes
(resource-specific: `logs:read`, `infra:admin`). The auth server (Hellō) returns
standard OIDC claims for identity scopes (`sub`, `tenant` for managed accounts)
and includes granted authorization scopes in the auth token's `scope` claim.

**Token endpoint parameters** (POST body):
- `resource_token` — the resource token from the 401 challenge
- `purpose` — human-readable description of why access is needed
- `localhost_callback` — for localhost redirect flows
- `login_hint` — suggested user identity
- `tenant` — enterprise tenant hint
- `domain_hint` — enterprise domain hint

**Token endpoint headers:**
- `Prefer: wait=N` — long-polling preference (typically 45s)

**202 deferred flow:**
- `Location` header → polling URL
- `Retry-After` header → polling interval
- `Cache-Control: no-store`
- Optional `AAuth: require=interaction; code="..."` for user interaction
- Agent polls with signed GET + `Prefer: wait=N`
- Terminal: 200/403/408/410/500. Transient: 202/503.

**Spec-required error responses** (JSON with `Cache-Control: no-store`):
- `invalid_signature` (401) — missing/invalid HTTP signature
- `invalid_agent_token` (401) — agent token verification failed
- `invalid_auth_token` (401) — auth token verification failed
- `key_binding_failed` (401) — request signing key doesn't match token cnf.jwk
- `insufficient_scope` (403) — operation exceeds authorized scopes

**Auth token validation** verifies: JWT signature against auth server JWKS,
`typ: auth+jwt`, `iss` matches authServer, `aud` includes this resource,
`exp` not expired, `cnf.jwk` matches HTTP signature key (key binding), `scope` covers operation.

Built on `@hellocoop/httpsig` (verify, JWKS discovery) and `jose` (JWT creation/verification)

**Deferred Responses and Interaction (Phase 3b):**
- Tool handlers that need user interaction (e.g., downstream OAuth consent) return 202 Accepted
- `AAuth: require=interaction; code="ABCD1234"` header with interaction code
- `InteractionManager` class handles pending request lifecycle (create/resolve/reject/expire)
- Location header points to `/pending/{id}` polling URLs
- Agent polls with signed GET + `Prefer: wait=N`; server returns 202 (still pending) or terminal response
- Clarification chat: 202 poll response with `{ "clarification": "..." }`, agent POSTs `clarification_response`
- `interaction_endpoint` serving for user-facing consent/auth flows
- Per the AAuth spec: any endpoint can return 202 — this is a first-class protocol primitive
- Enables MCP servers to act as OAuth clients to downstream resources on the user's behalf

### Phase 4: `@aauth/mcp-stdio`

- stdio ↔ HTTP bridge process
- Env var configuration
- Uses `@aauth/mcp-agent` + `@aauth/local-keys`
- Includes setup flow (key gen, keychain, GitHub Pages)
- First real end-to-end test with Claude Code

### Phase 5: `@aauth/mcp-openclaw`

- OpenClaw plugin wrapping `@aauth/mcp-agent` + `@aauth/mcp-server`
- `api.registerTool()` bridge for remote MCP server tools
- Plugin config for MCP server URLs
- Includes setup flow (key gen, keychain, GitHub Pages)
- Bundled `SKILL.md` with setup and usage instructions

---

## Reference: Python Implementation

The Python impl in `aauth-implementation` covers all 7 protocol phases and is a useful reference for:

- Token structures and validation — `aauth/tokens/`
- Challenge building — `aauth/resource/challenge_builder.py`
- Request verification with scope extraction — `aauth/resource/verifier.py`
- Phased test structure — `tests/test_phase1.py` through `test_phase7.py`

Note: the Python impl has its own HTTP signature implementation; our Node.js packages use `@hellocoop/httpsig` instead.

---

## E2E Testing with Mockin

`@hellocoop/mockin` (`../mockin`) is a mock Hellō server that now supports AAuth. It acts as the auth server in E2E tests, letting us test the full agent → resource → auth server flow without production infrastructure.

### What Mockin Provides

**AAuth Endpoints:**

| Endpoint | Purpose |
|----------|---------|
| `/.well-known/aauth-issuer.json` | AAuth metadata discovery |
| `/aauth/jwks` | Public keys (JWKS) |
| `/aauth/token` | Token endpoint (accepts signed requests, issues auth tokens) |
| `/aauth/pending/:id` | Polling endpoint for 202/interaction flows |
| `/aauth/interaction` | User interaction endpoint (auto-approves in mock mode) |

**Mock Configuration:**

| Endpoint | Purpose |
|----------|---------|
| `GET /mock/aauth` | Get current mock config |
| `PUT /mock/aauth` | Configure behavior (auto_grant, interaction_required, error simulation, custom claims, token_lifetime) |
| `DELETE /mock` | Reset all mock state |

**Token details:**
- Signs auth tokens with EdDSA (Ed25519), generated at startup
- Token header: `{ alg: 'EdDSA', typ: 'auth+jwt', kid }`
- Claims: `iss`, `sub`, `agent`, `cnf` (client's public key), `scope`, `aud`, `iat`, `exp`, `jti`
- HTTPSig verification on token endpoint via `@hellocoop/httpsig`

**Two modes:**
1. **Auto-grant** (default) — immediately issues tokens on valid signed request
2. **Interaction-required** — returns 202 + interaction code, client polls `/aauth/pending/:id`, "user" visits `/aauth/interaction?code=...` to approve

### E2E Test Architecture

```
Test harness
├── Agent (uses @aauth/mcp-agent)
│   └── Signs requests with ephemeral Ed25519 key
├── Resource (uses @aauth/mcp-server)
│   └── Validates signatures, issues resource tokens, verifies auth tokens
└── Auth Server (mockin)
    └── Accepts resource tokens, issues auth tokens
```

**Test flow:**
1. Start mockin (auth server) on a local port
2. Start resource server (using `@aauth/mcp-server`)
3. Agent sends signed request to resource
4. Resource returns 401 + AAuth challenge with resource_token
5. Agent sends resource_token to mockin's `/aauth/token` (signed request)
6. Mockin returns auth_token
7. Agent retries resource with auth_token in Signature-Key
8. Resource validates auth_token against mockin's JWKS, checks scopes
9. Resource returns 200

**Interaction flow test:**
1. Configure mockin: `PUT /mock/aauth { interaction_required: true }`
2. Agent requests token → gets 202 + pending URL + interaction code
3. Simulate user visiting interaction endpoint (auto-approves)
4. Agent polls pending URL → gets auth_token
5. Continue as above

### E2E Test Readiness

`@aauth/mcp-agent` now includes the full protocol engine:
- [x] AAuth challenge parsing (extract `resource-token` and `auth-server` from `AAuth` header)
- [x] Token exchange with auth server (POST signed request with resource_token + Prefer: wait)
- [x] 202 handling (poll pending URL with signed GET + Prefer: wait)
- [x] Clarification chat (202 with `clarification` body → POST `clarification_response`)
- [x] Auth token caching (reuse valid auth tokens, avoid redundant exchanges)
- [x] Retry with auth token after successful exchange
- [x] `createAAuthFetch` wraps it all into a single protocol-aware fetch

---

## Open Items

- [ ] npm support request for unscoped `aauth` package name
- [ ] `@aauth/local-keys` keychain serialization — store JWK JSON string? raw key bytes?
- [ ] `@aauth/mcp-agent` callback API design — exact signature for `getSignatureKey`
- [ ] Agent token refresh lifecycle — who triggers refresh, what's the timing?
- [ ] stdio wrapper: exact env var contract and MCP message proxying strategy
- [ ] Auth server integration (Hellō) — endpoints, request_type=auth flow
- [ ] Factor out shared code between `@aauth/mcp-agent` and `@aauth/mcp-server` if duplication emerges
- [ ] `@aauth/mcp-server` full `createAAuth`/`createAAuthMcpServer` high-level API (building blocks done: `buildAAuthHeader`, `InteractionManager`, `createResourceToken`)
- [ ] `@aauth/mcp-server` JWKS cache TTL and refresh strategy for auth server keys
- [ ] MCP SDK scope challenge support — track upstream issue #1151 (TypeScript SDK per-tool scope support), align our `authorize` return with whatever the SDK standardizes
