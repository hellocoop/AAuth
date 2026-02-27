import type { JWK } from 'jose'

export interface KeychainData {
  current: string
  keys: Record<string, JWK>
}

export interface GeneratedKeyPair {
  privateJwk: JWK
  publicJwk: JWK
}

export interface SignAgentTokenOptions {
  agentUrl: string
  delegateUrl: string
  lifetime?: number
}

export interface SignatureKeyJwt {
  type: 'jwt'
  jwt: string
}

export interface AgentTokenResult {
  signingKey: JWK
  signatureKey: SignatureKeyJwt
}

export interface CreateAgentTokenOptions {
  agentUrl: string
  delegate: string
  tokenLifetime?: number
}
