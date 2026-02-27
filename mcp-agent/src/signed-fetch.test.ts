import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockHttpSigFetch } = vi.hoisted(() => ({
  mockHttpSigFetch: vi.fn(),
}))

vi.mock('@hellocoop/httpsig', () => ({
  fetch: mockHttpSigFetch,
}))

import { createSignedFetch } from './signed-fetch.js'

describe('createSignedFetch', () => {
  const fakeKeyMaterial = {
    signingKey: { kty: 'OKP', crv: 'Ed25519', x: 'test' },
    signatureKey: { type: 'jwt' as const, jwt: 'eyJ...' },
  }

  const getKeyMaterial = vi.fn().mockResolvedValue(fakeKeyMaterial)

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns a function', () => {
    const signedFetch = createSignedFetch(getKeyMaterial)
    expect(typeof signedFetch).toBe('function')
  })

  it('calls getKeyMaterial and httpsig fetch', async () => {
    const fakeResponse = new Response('ok', { status: 200 })
    mockHttpSigFetch.mockResolvedValue(fakeResponse)

    const signedFetch = createSignedFetch(getKeyMaterial)
    const result = await signedFetch('https://example.com/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"jsonrpc":"2.0"}',
    })

    expect(getKeyMaterial).toHaveBeenCalledOnce()
    expect(mockHttpSigFetch).toHaveBeenCalledWith('https://example.com/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"jsonrpc":"2.0"}',
      signingKey: fakeKeyMaterial.signingKey,
      signatureKey: fakeKeyMaterial.signatureKey,
    })
    expect(result).toBe(fakeResponse)
  })

  it('passes through RequestInit options', async () => {
    mockHttpSigFetch.mockResolvedValue(new Response())

    const signedFetch = createSignedFetch(getKeyMaterial)
    await signedFetch('https://example.com', {
      method: 'PUT',
      headers: { Authorization: 'Bearer xyz' },
    })

    expect(mockHttpSigFetch).toHaveBeenCalledWith(
      'https://example.com',
      expect.objectContaining({
        method: 'PUT',
        headers: { Authorization: 'Bearer xyz' },
      }),
    )
  })

  it('works with no init argument', async () => {
    mockHttpSigFetch.mockResolvedValue(new Response())

    const signedFetch = createSignedFetch(getKeyMaterial)
    await signedFetch('https://example.com')

    expect(mockHttpSigFetch).toHaveBeenCalledWith('https://example.com', {
      signingKey: fakeKeyMaterial.signingKey,
      signatureKey: fakeKeyMaterial.signatureKey,
    })
  })
})
