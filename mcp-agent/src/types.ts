export interface SignatureKeyJwt {
  type: 'jwt'
  jwt: string
}

export interface SignatureKeyHwk {
  type: 'hwk'
}

export interface KeyMaterial {
  signingKey: JsonWebKey
  signatureKey: SignatureKeyJwt | SignatureKeyHwk
}

export type GetKeyMaterial = () => Promise<KeyMaterial>

export type FetchLike = (url: string | URL, init?: RequestInit) => Promise<Response>
