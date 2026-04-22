import { createAgentToken, readConfig, getAgentConfig } from '@aauth/local-keys'
import {
  createAAuthFetch,
  createSignedFetch,
  parseAAuthHeader,
  exchangeToken,
} from '@aauth/mcp-agent'
import type { GetKeyMaterial, KeyMaterial, Capability } from '@aauth/mcp-agent'
import open from 'open'

export function resolvePersonServer(agentUrl: string | undefined, override: string | undefined): string | undefined {
  if (override) return override
  if (!agentUrl) {
    const config = readConfig()
    const agents = Object.entries(config.agents)
    if (agents.length === 1) {
      return agents[0][1].personServerUrl
    }
    return undefined
  }
  const agentConfig = getAgentConfig(agentUrl)
  return agentConfig?.personServerUrl
}

export function buildGetKeyMaterial(args: { agentUrl?: string; delegate: string }): GetKeyMaterial {
  return () => createAgentToken({
    agentUrl: args.agentUrl,
    delegate: args.delegate,
  })
}

export function buildRequestInit(args: { method: string; data?: string; headers: string[] }): RequestInit {
  const headers = new Headers()
  for (const h of args.headers) {
    const colon = h.indexOf(':')
    if (colon === -1) continue
    headers.set(h.slice(0, colon).trim(), h.slice(colon + 1).trim())
  }

  if (args.data && !headers.has('content-type')) {
    headers.set('content-type', 'application/json')
  }

  const init: RequestInit = {
    method: args.method,
    headers,
  }
  if (args.data) {
    init.body = args.data
  }
  return init
}

/**
 * --authorize mode: manually drive the auth flow using low-level primitives
 * so we can capture and return the auth token + ephemeral signing key.
 */
export async function handleAuthorize(
  args: {
    url: string; agentUrl?: string; delegate: string; operations?: string; scope?: string;
    browser?: boolean; nonInteractive: boolean; verbose: boolean;
    loginHint?: string; domainHint?: string; tenant?: string; justification?: string;
    capabilities?: string[];
  },
  getKeyMaterial: GetKeyMaterial,
  personServer: string | undefined,
): Promise<void> {
  const shouldOpenBrowser = args.browser ?? process.stderr.isTTY ?? false
  const capabilities = args.capabilities as Capability[] | undefined

  const keyMaterial = await getKeyMaterial()
  const pinnedGetKeyMaterial: GetKeyMaterial = async () => keyMaterial

  const signedFetch = createSignedFetch(pinnedGetKeyMaterial, { capabilities })

  const url = new URL(args.url)
  if (args.scope) {
    url.searchParams.set('scope', args.scope)
  }

  const response = await signedFetch(url.toString(), { method: 'GET' })

  if (args.verbose) {
    console.error(JSON.stringify({
      status: response.status,
      headers: headersToObject(response.headers),
    }))
  }

  if (response.status === 200) {
    const body = await response.text()
    console.log(JSON.stringify({
      signingKey: keyMaterial.signingKey,
      signatureKey: keyMaterial.signatureKey,
      response: {
        status: 200,
        body: tryParseJson(body),
      },
    }, null, 2))
    return
  }

  if (response.status === 401) {
    const aauthHeader = response.headers.get('aauth-requirement')
    if (!aauthHeader) {
      console.error(JSON.stringify({ error: '401 response without AAuth-Requirement header' }))
      process.exitCode = 1
      return
    }

    const challenge = parseAAuthHeader(aauthHeader)

    if (challenge.requirement !== 'auth-token' || !challenge.resourceToken) {
      console.error(JSON.stringify({
        error: `Unexpected challenge requirement: ${challenge.requirement}`,
      }))
      process.exitCode = 1
      return
    }

    if (!personServer) {
      console.error(JSON.stringify({
        error: 'Person server URL required for token exchange. Set in config or use --person-server.',
      }))
      process.exitCode = 1
      return
    }

    const result = await exchangeToken({
      signedFetch,
      authServerUrl: personServer,
      resourceToken: challenge.resourceToken,
      justification: args.justification,
      loginHint: args.loginHint,
      tenant: args.tenant,
      domainHint: args.domainHint,
      onInteraction: (code, interactionEndpoint) => {
        if (args.nonInteractive) {
          throw new Error(`Consent required but --non-interactive set. URL: ${interactionEndpoint}?code=${code}`)
        }
        const interactionUrl = `${interactionEndpoint}?code=${code}`
        console.error(JSON.stringify({ interaction: { url: interactionUrl, code } }))
        if (shouldOpenBrowser) {
          open(interactionUrl)
        }
      },
    })

    console.log(JSON.stringify({
      authToken: result.authToken,
      expiresIn: result.expiresIn,
      signingKey: keyMaterial.signingKey,
      response: {
        status: 200,
      },
    }, null, 2))
    return
  }

  const body = await response.text()
  console.error(JSON.stringify({
    error: `Unexpected response status: ${response.status}`,
    body: tryParseJson(body),
  }))
  process.exitCode = 1
}

/**
 * Pre-authed mode: use provided auth token + signing key.
 */
export async function handlePreAuthed(
  args: { url: string; method: string; authToken: string; signingKey: string; verbose: boolean; data?: string; headers: string[] },
  init: RequestInit,
): Promise<void> {
  let signingKey: JsonWebKey
  try {
    signingKey = JSON.parse(args.signingKey!) as JsonWebKey
  } catch {
    console.error(JSON.stringify({ error: 'Invalid --signing-key: must be valid JSON (JWK)' }))
    process.exitCode = 1
    return
  }

  const getKeyMaterial: GetKeyMaterial = async () => ({
    signingKey,
    signatureKey: { type: 'jwt' as const, jwt: args.authToken! },
  })

  const signedFetch = createSignedFetch(getKeyMaterial)
  const response = await signedFetch(args.url!, init)

  await outputResponse(response, args.verbose)
}

/**
 * --agent-only mode: sign with agent token, don't handle 401.
 */
export async function handleAgentOnly(
  args: { url: string; verbose: boolean },
  init: RequestInit,
  getKeyMaterial: GetKeyMaterial,
): Promise<void> {
  const signedFetch = createSignedFetch(getKeyMaterial)
  const response = await signedFetch(args.url!, init)
  await outputResponse(response, args.verbose)
}

/**
 * Default mode: full AAuth protocol flow.
 */
export async function handleFullFlow(
  args: {
    url: string; browser?: boolean; nonInteractive: boolean; verbose: boolean;
    loginHint?: string; domainHint?: string; tenant?: string; justification?: string;
    capabilities?: string[];
  },
  init: RequestInit,
  getKeyMaterial: GetKeyMaterial,
  personServer: string | undefined,
): Promise<void> {
  const shouldOpenBrowser = args.browser ?? process.stdout.isTTY ?? false

  const aAuthFetch = createAAuthFetch({
    getKeyMaterial,
    authServerUrl: personServer,
    justification: args.justification,
    loginHint: args.loginHint,
    tenant: args.tenant,
    domainHint: args.domainHint,
    capabilities: args.capabilities as Capability[],
    onInteraction: (code, interactionEndpoint) => {
      if (args.nonInteractive) {
        throw new Error(`Consent required but --non-interactive set. URL: ${interactionEndpoint}?code=${code}`)
      }
      const url = `${interactionEndpoint}?code=${code}`
      console.error(JSON.stringify({ interaction: { url, code } }))
      if (shouldOpenBrowser) {
        open(url)
      }
    },
  })

  const response = await aAuthFetch(args.url!, init)
  await outputResponse(response, args.verbose)
}

export async function outputResponse(response: Response, verbose: boolean): Promise<void> {
  if (verbose) {
    console.error(JSON.stringify({
      status: response.status,
      headers: headersToObject(response.headers),
    }))
  }

  const body = await response.text()
  const parsed = tryParseJson(body)
  if (parsed !== undefined) {
    console.log(JSON.stringify(parsed, null, 2))
  } else {
    console.log(body)
  }
}

export function headersToObject(headers: Headers): Record<string, string> {
  const obj: Record<string, string> = {}
  headers.forEach((value, key) => { obj[key] = value })
  return obj
}

export function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}
