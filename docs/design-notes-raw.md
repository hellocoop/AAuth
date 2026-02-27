# AAuth + MCP Integration Plan

## Overview

This plan covers two related workstreams:

1. **Agent Identity via GitHub Pages** — a portable, verifiable identity for AI agents anchored at a GitHub Pages URL
2. **AAuth for MCP Libraries** — adding AAuth (agent authentication/authorization) support to MCP server frameworks, starting with OpenClaw

---

## Part 1: Agent Identity via GitHub Pages

### Concept

An agent's identity is anchored at a well-known URL on GitHub Pages:

```
https://<username>.github.io/<reponame>/.well-known/aauth-agent.json
```

with a corresponding JWKS document at:

```
https://<username>.github.io/<reponame>/.well-known/jwks.json
```

**Trust model:** Only the GitHub account owner can publish to their `*.github.io` Pages site, so the URL serves as a verifiable identity anchor — anyone can confirm who controls the agent by checking who owns the GitHub repo.

### Key Architecture

- **Algorithm:** P-256 / ES256 (compact, widely supported, good for constrained environments)
- **Delegation model:** A long-lived root identity key signs short-lived agent tokens, minimizing key exposure during runtime
- **Root key** lives in secure storage; **agent tokens** are ephemeral

### Key Storage: Fail at Install, Trust at Runtime

The root identity key is stored in the **OS platform keychain** via [`@napi-rs/keyring`](https://www.npmjs.com/package/@napi-rs/keyring) (Rust-based native bindings, prebuilt — no compile step, keytar drop-in replacement, MS OSS Fund backed maintainer).

| Platform | Backend |
|----------|---------|
| macOS | Keychain (Security.framework) |
| Windows | Credential Manager |
| Linux | Secret Service API (gnome-keyring, KWallet, etc.) |

**No fallback chain.** If the platform keychain isn't available at `npx @aauth/agent-setup init` time, setup **fails with a clear error** telling the dev what they need (e.g. "install gnome-keyring"). If init succeeded, the secret is in the platform store and every subsequent read is guaranteed to work.

This eliminates:
- Encrypted file fallback (and all questions around its security model)
- Runtime backend detection logic
- Any ambiguity about where the key lives

**Why this is safe for deployment:** The delegation model means the root key stays on the dev machine in the platform keychain. Deployed agents only carry short-lived tokens signed by the root key — the root key never needs to leave the machine where init ran.

### GitHub Pages Hosting Requirements

- **`.nojekyll` file** in repo root — prevents Jekyll from filtering dotfiles/directories
- **`.json` extension** on documents — GitHub Pages serves correct `application/json` content-type for `.json` files
- Files go in: `<repo>/.well-known/aauth-agent.json` and `<repo>/.well-known/jwks.json`

### `aauth-agent.json` Structure (Draft)

```json
{
  "id": "https://username.github.io/my-agent/.well-known/aauth-agent.json",
  "name": "My Agent",
  "description": "An AI agent that does things",
  "jwks_uri": "https://username.github.io/my-agent/.well-known/jwks.json",
  "auth_server": "https://hello.coop"
}
```

### Setup Tool

An independent CLI tool — **not** coupled to any specific agent runtime (OpenClaw, LangChain, etc.) — making the identity portable.

```bash
npx @aauth/agent-setup init
```

This tool:

1. Generates a P-256 key pair via Node.js `crypto.subtle`
2. Stores the root private key in the OS platform keychain via `@napi-rs/keyring` — **fails if keychain unavailable**
3. Scaffolds the `.well-known/` directory with `aauth-agent.json` and `jwks.json`
4. Creates `.nojekyll`
5. Optionally pushes to GitHub Pages

---

## Part 2: AAuth for MCP Libraries

### Target Libraries

Based on our research of the MCP ecosystem, these are the top candidates for AAuth integration:

#### Tier 1 — Highest Impact

| Library | Why | Auth Status |
|---------|-----|-------------|
| **`@modelcontextprotocol/sdk`** | Official SDK, canonical starting point | Has transport layer, no agent auth |
| **FastMCP** (`fastmcp`) | Most popular community framework, Hono-based | Has OAuth 2.1 + JWKS — closest to AAuth-ready |
| **`mcp-framework`** | Class-based, auto-discovery, growing adoption | Has OAuth 2.1 + JWT/JWKS |

#### Tier 2 — Emerging

| Library | Why |
|---------|-----|
| **`mcp-use`** (`mcp-use-ts`) | Agent-side (client), LangChain integration |
| **LeanMCP** | Decorator-based, serverless-friendly |

### Integration Approach: Middleware Pattern

AAuth integrates as middleware that sits between the MCP transport layer and tool handlers. The developer opts in per-tool with progressive complexity:

```js
import { aauth } from '@aauth/mcp'

// Simplest — just a scope
aauth.requireScopes('read-file', ['files.read'])

// Static rich context
aauth.requireAuthRequest('admin-reset', {
  description: 'Reset all user settings to defaults',
  destructive: true,
  scope: 'admin.write',
})

// Dynamic — built from actual call arguments, generates RAR document
aauth.requireAuthRequest('bulk-export', async (args) => ({
  description: `Export ${args.format} data for ${args.dateRange}`,
  scope: 'data.export',
  estimatedRecords: await estimateRecords(args.dateRange),
}))
```

### Dynamic RAR (Rich Authorization Request) Documents

The middleware generates RAR documents dynamically at request time rather than pointing to static documents:

- **Single scope case:** auto-generates a trivial RAR document — zero extra work for the developer
- **Rich case:** developer provides a function that receives the tool call arguments and returns authorization context
- The middleware uploads the generated document to a short-lived URL (or serves inline) and puts `auth_request_url` in the resource token

### OpenClaw Integration

OpenClaw's architecture (Gateway → Brain/LLM → Sandbox → Skills) with its plugin system (channels, tools, memory, providers) makes it a natural first target for a PR:

- AAuth plugs in at the **Gateway** layer as a middleware/plugin
- Agent identity is loaded from the `.well-known/` configuration
- Resource tokens are minted per-tool-call, with scopes/RAR defined per skill
- The `purpose` claim (recently added to the AAuth spec) can carry agent intent for user consent screens

### What the PR Adds to OpenClaw

1. AAuth middleware plugin for the Gateway
2. Per-skill scope/auth configuration
3. Agent identity loading from `aauth-agent.json`
4. Token minting with dynamic RAR support
5. Example skill demonstrating all three complexity levels (scope, static, dynamic)

---

## Part 3: `@aauth` Package Architecture

### npm Namespace

The `@aauth` npm scope is secured. The unscoped `aauth` package is blocked by npm's similarity heuristic due to an abandoned `a-auth` package (npm support request planned).

### Monorepo Structure

```
@aauth/
├── core          — Key generation, token signing/verification, ES256 utilities
├── client        — AAuth client (for agent runtimes requesting tokens)
├── resource      — AAuth resource server (for services validating tokens)
├── agent-setup   — CLI tool for identity provisioning + GitHub Pages scaffolding
└── mcp           — MCP middleware (wraps core + resource for MCP frameworks)
```

### Key Package Roles

| Package | Role | Used By |
|---------|------|---------|
| `@aauth/core` | Crypto primitives, token signing/verification, ES256 utilities | Everything |
| `@aauth/client` | Request tokens from auth server (Hellō) | Agent runtimes |
| `@aauth/resource` | Validate tokens, enforce scopes | MCP servers, APIs |
| `@aauth/agent-setup` | CLI: `npx @aauth/agent-setup init` — key gen + platform keychain storage + GitHub Pages scaffolding | Developers setting up agents |
| `@aauth/mcp` | `requireScopes()`, `requireAuthRequest()` middleware | FastMCP, mcp-framework, OpenClaw |

### Key Dependencies

| Dependency | Used By | Purpose |
|------------|---------|---------|
| `@napi-rs/keyring` | `@aauth/agent-setup` | OS keychain access (macOS/Windows/Linux) — hard dep, fail if unavailable |
| `jose` | `@aauth/core` | ES256/P-256/JWK/JWT operations |
| Node.js `crypto.subtle` | `@aauth/core`, `@aauth/agent-setup` | Key generation (P-256) |

### Tech Stack

- **Runtime:** Node.js, ESM
- **Crypto:** Node.js `crypto.subtle` for key generation; `jose` for ES256/P-256/JWK/JWT
- **Key storage:** `@napi-rs/keyring` — hard dependency, no fallback
- **MCP integration:** Works with `@modelcontextprotocol/sdk` transports

---

## Sequencing

```
Phase 1: @aauth/core + @aauth/agent-setup
         ↓
         Ship CLI that generates identity + GitHub Pages scaffolding

Phase 2: @aauth/resource + @aauth/mcp
         ↓
         Ship MCP middleware with requireScopes / requireAuthRequest

Phase 3: OpenClaw PR
         ↓
         First real-world integration demonstrating the full flow

Phase 4: FastMCP + mcp-framework PRs
         ↓
         Broaden ecosystem adoption
```

---

## Open Questions

- [ ] RAR document schema — defined in AAuth spec or intentionally open for resources?
- [ ] npm support request for unscoped `aauth` package name
- [ ] `purpose` claim in resource tokens vs auth tokens vs both (currently specced for both)
- [ ] OpenClaw PR scope — Gateway plugin only, or also include example skill?
