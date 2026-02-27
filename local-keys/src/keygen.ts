import { generateKeyPair, exportJWK } from 'jose'
import type { JWK } from 'jose'
import type { GeneratedKeyPair } from './types.js'

function generateKid(): string {
  const now = new Date()
  const date = now.toISOString().slice(0, 10) // YYYY-MM-DD
  const hex = Math.floor(Math.random() * 0xfff)
    .toString(16)
    .padStart(3, '0')
  return `${date}_${hex}`
}

export async function generateKey(): Promise<GeneratedKeyPair> {
  const kid = generateKid()
  const { publicKey, privateKey } = await generateKeyPair('EdDSA', {
    crv: 'Ed25519',
  })

  const privateJwk = await exportJWK(privateKey)
  const publicJwk = await exportJWK(publicKey)

  privateJwk.kid = kid
  publicJwk.kid = kid

  return { privateJwk, publicJwk }
}

export function toPublicJwk(jwk: JWK): JWK {
  const { d: _d, ...pub } = jwk
  return { ...pub, use: 'sig', alg: 'EdDSA' }
}
