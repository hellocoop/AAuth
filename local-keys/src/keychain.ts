import { Entry, findCredentials } from '@napi-rs/keyring'
import type { KeychainData } from './types.js'

const SERVICE = 'aauth'

export function readKeychain(agentUrl: string): KeychainData | null {
  try {
    const entry = new Entry(SERVICE, agentUrl)
    const raw = entry.getPassword()
    if (!raw) return null
    return JSON.parse(raw) as KeychainData
  } catch {
    return null
  }
}

export function writeKeychain(agentUrl: string, data: KeychainData): void {
  const entry = new Entry(SERVICE, agentUrl)
  entry.setPassword(JSON.stringify(data))
}

export function deleteKeychain(agentUrl: string): void {
  const entry = new Entry(SERVICE, agentUrl)
  entry.deletePassword()
}

export function listAgentUrls(): string[] {
  const creds = findCredentials(SERVICE)
  return creds.map((c) => c.account)
}
