import { describe, it, expect } from 'vitest'
import { buildAAuthHeader } from './aauth-header.js'

describe('buildAAuthHeader', () => {
  it('builds pseudonym header', () => {
    expect(buildAAuthHeader('pseudonym')).toBe('require=pseudonym')
  })

  it('builds identity header', () => {
    expect(buildAAuthHeader('identity')).toBe('require=identity')
  })

  it('builds approval header', () => {
    expect(buildAAuthHeader('approval')).toBe('require=approval')
  })

  it('builds auth-token header with resource-token and auth-server', () => {
    const result = buildAAuthHeader('auth-token', {
      resourceToken: 'eyJhbGciOiJFZERTQSJ9.test',
      authServer: 'https://auth.example.com',
    })
    expect(result).toBe(
      'require=auth-token; resource-token="eyJhbGciOiJFZERTQSJ9.test"; auth-server="https://auth.example.com"',
    )
  })

  it('builds interaction header with code', () => {
    const result = buildAAuthHeader('interaction', { code: 'ABCD1234' })
    expect(result).toBe('require=interaction; code="ABCD1234"')
  })

  it('auth-token header is parseable (round-trip check)', () => {
    const header = buildAAuthHeader('auth-token', {
      resourceToken: 'tok.en.here',
      authServer: 'https://auth.hello.coop',
    })
    // Should contain the exact format
    expect(header).toContain('require=auth-token')
    expect(header).toContain('resource-token="tok.en.here"')
    expect(header).toContain('auth-server="https://auth.hello.coop"')
  })

  it('throws on auth-token missing params', () => {
    expect(() => (buildAAuthHeader as Function)('auth-token'))
      .toThrow('auth-token requires resourceToken and authServer')
    expect(() => (buildAAuthHeader as Function)('auth-token', { resourceToken: 'x' }))
      .toThrow('auth-token requires resourceToken and authServer')
    expect(() => (buildAAuthHeader as Function)('auth-token', { authServer: 'x' }))
      .toThrow('auth-token requires resourceToken and authServer')
  })

  it('throws on interaction missing code', () => {
    expect(() => (buildAAuthHeader as Function)('interaction'))
      .toThrow('interaction requires code')
  })
})
