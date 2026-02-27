#!/usr/bin/env node

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { createSignedFetch } from '@aauth/mcp-agent'
import { createAgentToken } from '@aauth/local-keys'
import { parseArgs } from './args.js'
import { bridgeTransports } from './proxy.js'

const { serverUrl, agentUrl, delegate, tokenLifetime } = parseArgs(process.argv)

const getKeyMaterial = () =>
  createAgentToken({
    agentUrl,
    delegate: delegate ?? 'claude',
    tokenLifetime,
  })

const signedFetch = createSignedFetch(getKeyMaterial)

const remote = new StreamableHTTPClientTransport(new URL(serverUrl), {
  fetch: signedFetch,
})

const local = new StdioServerTransport()

bridgeTransports(local, remote).catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
