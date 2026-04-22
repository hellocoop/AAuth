---
name: fetch
description: How to use @aauth/fetch to make AAuth-authenticated HTTP requests
when: Agent needs to call an AAuth-protected API
---

# @aauth/fetch

Make HTTP requests to AAuth-protected APIs. Handles HTTP message signatures, agent tokens, and the full AAuth authorization flow.

## Discovery

Before calling an API, discover what it supports:

```bash
# Fetch resource metadata
curl https://example.aauth.dev/.well-known/aauth-resource.json
```

The metadata tells you:
- What scopes are available (`scope_descriptions`)
- Whether it uses R3 vocabularies (`r3_vocabularies`)
- The resource's signing keys (`jwks_uri`)

For R3 resources with OpenAPI vocabularies:
```bash
# Fetch the OpenAPI spec to see available operations
curl https://notes.aauth.dev/openapi.json
```

## One-shot request (simplest)

For resources that work with just an agent token (no authorization needed):

```bash
npx @aauth/fetch https://whoami.aauth.dev
```

If the resource returns a 401 challenge, fetch automatically handles the authorization flow — exchanging tokens with your person server, opening a browser for consent if needed, and retrying.

## One-shot with scopes

To request specific identity scopes:

```bash
npx @aauth/fetch "https://whoami.aauth.dev?scope=email+profile"
```

## Multi-call workflow (recommended for APIs)

When making multiple calls to the same resource, use the authorize-then-call pattern to avoid repeating the auth flow.

### Step 1: Authorize and capture tokens

```bash
npx @aauth/fetch --authorize https://notes.aauth.dev
```

If the resource requires authorization (401 challenge), returns:
```json
{
  "authToken": "eyJ...",
  "expiresIn": 3600,
  "signingKey": { "kty": "OKP", "crv": "Ed25519", "d": "...", "x": "..." },
  "response": { "status": 200 }
}
```

If the resource accepts an agent token directly (no auth needed), returns:
```json
{
  "signingKey": { "kty": "OKP", "crv": "Ed25519", "d": "...", "x": "..." },
  "signatureKey": { "type": "jwt", "jwt": "eyJ..." },
  "response": { "status": 200, "body": { ... } }
}
```

Save `authToken` and `signingKey` for subsequent calls. The `signingKey` is the ephemeral private key bound to the auth token — you must use the same key for all requests.

### Step 2: Make calls with saved tokens

Pass tokens via JSON stdin (recommended — avoids exposing keys in process list):

```bash
echo '{
  "url": "https://notes.aauth.dev/notes",
  "method": "GET",
  "authToken": "eyJ...",
  "signingKey": {"kty":"OKP","crv":"Ed25519","d":"...","x":"..."}
}' | npx @aauth/fetch --json
```

Or for POST/PUT:
```bash
echo '{
  "url": "https://notes.aauth.dev/notes",
  "method": "POST",
  "body": {"title": "My Note", "body": "Content here"},
  "authToken": "eyJ...",
  "signingKey": {"kty":"OKP","crv":"Ed25519","d":"...","x":"..."}
}' | npx @aauth/fetch --json
```

### Token expiration

Auth tokens have a limited lifetime. If a call returns a 401 after previously working, the token has expired. Re-run the `--authorize` step to get fresh tokens.

## Agent-only mode

To sign with just an agent token without triggering the authorization flow:

```bash
npx @aauth/fetch --agent-only https://whoami.aauth.dev
```

Useful when the resource accepts agent identity without requiring an auth token.

## Hint parameters

Hints help the person server route authorization requests. They are optional and passed during token exchange.

| Flag | JSON field | Purpose |
|------|-----------|---------|
| `--login-hint <hint>` | `loginHint` | Hint about who to authorize — a user identifier, email, or account name. Follows OpenID Connect conventions. Helps the person server pre-fill login or identify the correct user. |
| `--domain-hint <domain>` | `domainHint` | Hints at which domain or organization the user belongs to. Used in enterprise/multi-tenant systems to route to the correct identity provider. |
| `--tenant <id>` | `tenant` | Tenant identifier for multi-tenant systems. Specifies which organization context should be used for authorization. |

Example:
```bash
npx @aauth/fetch --authorize https://resource.example \
  --login-hint user@acme.com \
  --tenant acme.com
```

Or via JSON stdin:
```json
{
  "url": "https://resource.example",
  "authorize": true,
  "loginHint": "user@acme.com",
  "tenant": "acme.com"
}
```

## Justification

The `--justification` flag provides a Markdown string explaining **why** the agent is requesting access. The person server presents this to the user during consent review.

```bash
npx @aauth/fetch --authorize https://notes.aauth.dev \
  --justification "Read the user's notes to summarize action items from today's meeting"
```

Via JSON stdin:
```json
{
  "url": "https://notes.aauth.dev",
  "authorize": true,
  "justification": "Read the user's notes to summarize action items from today's meeting"
}
```

Justification is especially important for autonomous agents — it enables human reviewers to make informed consent decisions that policy engines cannot make automatically.

## Capabilities

Capabilities declare which protocol features the agent supports. Resources and person servers use this to tailor their responses.

```bash
npx @aauth/fetch --capabilities interaction,clarification https://resource.example
```

| Capability | Meaning |
|-----------|---------|
| `interaction` | Agent can direct a user to a URL for authentication, consent, payment, or other actions. Declare this when a human is present or the agent's person server can handle redirects. |
| `clarification` | Agent can engage in back-and-forth clarification chat with the user through the person server. The user can ask questions about the request and the agent can respond. |
| `payment` | Agent can handle payment flows — either directly or via its person server. Required for resources that may issue `402 Payment Required` challenges. |

When capabilities are not declared, servers must not assume the agent supports any of these features. Declare the capabilities your agent actually supports to get the best experience.

Via JSON stdin:
```json
{
  "url": "https://resource.example",
  "capabilities": ["interaction", "clarification"]
}
```

## Common flags

| Flag | Description |
|------|-------------|
| `--authorize` | Auth flow only; return tokens + signing key as JSON |
| `--agent-only` | Sign with agent token only; don't handle 401 |
| `--json` | Read full request from stdin as JSON |
| `-X, --method` | HTTP method (default: GET) |
| `-d, --data` | Request body |
| `-H, --header` | Additional header (repeatable) |
| `--agent-url` | Override agent URL |
| `--delegate` | Delegate name (default: "fetch") |
| `--scope` | Requested scopes |
| `--operations` | R3 operationIds (comma-separated) |
| `--person-server` | Override person server URL |
| `--login-hint` | Hint about who to authorize |
| `--domain-hint` | Domain/org routing hint |
| `--tenant` | Tenant identifier |
| `--justification` | Markdown explaining why access is needed |
| `--capabilities` | Agent capabilities (comma-separated) |
| `--no-browser` | Don't auto-open browser for consent |
| `--non-interactive` | Fail if consent is needed |
| `-v, --verbose` | Show status + headers on stderr |

## Error handling

Errors are output as JSON to stderr:
```json
{"error": "description of what went wrong"}
```

When consent is needed and `--non-interactive` is not set, interaction info is output to stderr:
```json
{"interaction": {"url": "https://...", "code": "ABCD-1234"}}
```

## Environment variables

| Variable | Equivalent flag |
|----------|----------------|
| `AAUTH_AGENT_URL` | `--agent-url` |
| `AAUTH_DELEGATE` | `--delegate` |
| `AAUTH_AUTH_TOKEN` | `--auth-token` |
| `AAUTH_SIGNING_KEY` | `--signing-key` |
| `AAUTH_PERSON_SERVER` | `--person-server` |
