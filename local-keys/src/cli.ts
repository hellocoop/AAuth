#!/usr/bin/env node

import { readFileSync, readdirSync } from 'node:fs'
import { join, basename, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { generateKey, toPublicJwk } from './keygen.js'
import { readKeychain, writeKeychain, listAgentUrls } from './keychain.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const skillsDir = join(__dirname, '..', 'skills')

function validateUrl(s: string): string | null {
  let url: URL
  try {
    url = new URL(s)
  } catch {
    return 'not a valid URL'
  }
  if (url.protocol !== 'https:') return 'must be https://'
  if (url.port) return 'must not include a port'
  if (url.pathname.endsWith('/') && url.pathname !== '/')
    return 'must not have a trailing slash'
  if (
    !/^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*$/.test(
      url.hostname,
    )
  )
    return 'invalid hostname'
  if (!url.hostname.includes('.')) return 'hostname must have a domain'
  return null
}

function getSkills(): string[] {
  try {
    return readdirSync(skillsDir)
      .filter((f) => f.endsWith('.md'))
      .map((f) => basename(f, '.md'))
  } catch {
    return []
  }
}

function showHelp() {
  console.log(`Usage: npx @aauth/local-keys [command | agent-url]

Commands:
  <agent-url>        Generate a key pair and store in OS keychain
  help               Show this help
  skill [name]       Show agent skill instructions

Run with no arguments to see stored keys.
Run "npx @aauth/local-keys skill" to list available skills.`)
}

function showKeys() {
  const urls = listAgentUrls()
  if (urls.length === 0) {
    console.log('No keys stored.\n')
    console.log('To create a key:\n')
    console.log('  npx @aauth/local-keys <agent-url>\n')
    console.log('Run "npx @aauth/local-keys help" for more options.')
    return
  }

  for (const url of urls) {
    const data = readKeychain(url)
    if (!data) continue
    console.log(url)
    for (const [kid, jwk] of Object.entries(data.keys)) {
      const marker = kid === data.current ? ' (current)' : ''
      console.log(`  ${kid}${marker}`)
      console.log(`    x: ${jwk.x}`)
    }
  }
}

function showSkill(name?: string) {
  const skills = getSkills()

  if (!name) {
    if (skills.length === 0) {
      console.log('No skills available.')
      return
    }
    console.log('Available skills:\n')
    for (const s of skills) {
      console.log(`  npx @aauth/local-keys skill ${s}`)
    }
    return
  }

  if (!skills.includes(name)) {
    console.error(`Unknown skill: "${name}"\n`)
    console.error('Available skills:')
    for (const s of skills) {
      console.error(`  ${s}`)
    }
    process.exitCode = 1
    return
  }

  const content = readFileSync(join(skillsDir, `${name}.md`), 'utf-8')
  console.log(content)
}

async function create(agentUrl: string) {
  const { privateJwk, publicJwk } = await generateKey()
  const kid = publicJwk.kid!

  const existing = readKeychain(agentUrl)
  const data = existing ?? { current: kid, keys: {} }
  data.current = kid
  data.keys[kid] = privateJwk
  writeKeychain(agentUrl, data)

  console.log(`Generated Ed25519 key pair`)
  console.log(`  kid: ${kid}`)
  console.log()
  console.log(`Stored in keychain:`)
  console.log(`  service: aauth`)
  console.log(`  account: ${agentUrl}`)
  console.log()
  console.log(`Public JWK:`)
  console.log(`  ${JSON.stringify(toPublicJwk(publicJwk))}`)
}

async function run() {
  const [first, second] = process.argv.slice(2)

  if (!first) {
    showKeys()
    return
  }

  if (first === 'help') {
    showHelp()
    return
  }

  if (first === 'skill') {
    showSkill(second)
    return
  }

  const urlError = validateUrl(first)
  if (urlError) {
    console.error(`"${first}" — ${urlError}\n`)
    console.error('Usage: npx @aauth/local-keys <agent-url>')
    process.exitCode = 1
    return
  }

  await create(first)
}

run().catch((err) => {
  console.error(err.message)
  process.exitCode = 1
})
