import { describe, it, expect } from 'vitest'
import { parseAAuthHeader } from './aauth-header.js'

describe('parseAAuthHeader', () => {
  it('parses require=pseudonym', () => {
    const result = parseAAuthHeader('require=pseudonym')
    expect(result).toEqual({ require: 'pseudonym' })
  })

  it('parses require=identity', () => {
    const result = parseAAuthHeader('require=identity')
    expect(result).toEqual({ require: 'identity' })
  })

  it('parses require=approval', () => {
    const result = parseAAuthHeader('require=approval')
    expect(result).toEqual({ require: 'approval' })
  })

  it('parses require=auth-token with resource-token and auth-server', () => {
    const header = 'require=auth-token; resource-token="eyJhbGciOiJFZERTQSJ9.test"; auth-server="https://auth.example.com"'
    const result = parseAAuthHeader(header)
    expect(result).toEqual({
      require: 'auth-token',
      resourceToken: 'eyJhbGciOiJFZERTQSJ9.test',
      authServer: 'https://auth.example.com',
    })
  })

  it('parses require=interaction with code', () => {
    const header = 'require=interaction; code="ABCD1234"'
    const result = parseAAuthHeader(header)
    expect(result).toEqual({
      require: 'interaction',
      code: 'ABCD1234',
    })
  })

  it('handles extra whitespace', () => {
    const header = '  require=auth-token ;  resource-token="tok123" ;  auth-server="https://auth.example"  '
    const result = parseAAuthHeader(header)
    expect(result).toEqual({
      require: 'auth-token',
      resourceToken: 'tok123',
      authServer: 'https://auth.example',
    })
  })

  it('throws on empty header', () => {
    expect(() => parseAAuthHeader('')).toThrow('Empty AAuth header')
    expect(() => parseAAuthHeader('  ')).toThrow('Empty AAuth header')
  })

  it('throws on missing require=', () => {
    expect(() => parseAAuthHeader('pseudonym')).toThrow('Missing require=')
  })

  it('throws on unknown require level', () => {
    expect(() => parseAAuthHeader('require=unknown')).toThrow('Unknown require level')
  })

  it('throws on auth-token missing resource-token', () => {
    expect(() => parseAAuthHeader('require=auth-token; auth-server="https://auth.example"'))
      .toThrow('auth-token challenge missing resource-token')
  })

  it('throws on auth-token missing auth-server', () => {
    expect(() => parseAAuthHeader('require=auth-token; resource-token="tok123"'))
      .toThrow('auth-token challenge missing auth-server')
  })

  it('throws on interaction missing code', () => {
    expect(() => parseAAuthHeader('require=interaction'))
      .toThrow('interaction challenge missing code')
  })

  it('ignores unknown parameters', () => {
    const header = 'require=pseudonym; unknown="value"'
    const result = parseAAuthHeader(header)
    expect(result).toEqual({ require: 'pseudonym' })
  })
})
