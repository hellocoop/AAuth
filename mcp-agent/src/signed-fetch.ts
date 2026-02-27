import { fetch as httpSigFetch } from '@hellocoop/httpsig'
import type { GetKeyMaterial, FetchLike } from './types.js'

export function createSignedFetch(getKeyMaterial: GetKeyMaterial): FetchLike {
  return async (url: string | URL, init?: RequestInit): Promise<Response> => {
    const { signingKey, signatureKey } = await getKeyMaterial()
    const response = await httpSigFetch(url, {
      ...init,
      signingKey,
      signatureKey,
    })
    return response as Response
  }
}
