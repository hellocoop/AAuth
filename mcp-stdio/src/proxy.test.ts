import { describe, it, expect, vi, beforeEach } from 'vitest'
import { bridgeTransports } from './proxy.js'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'

function createMockTransport(): Transport {
  return {
    start: vi.fn().mockResolvedValue(undefined),
    send: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    onmessage: undefined,
    onclose: undefined,
    onerror: undefined,
  } as unknown as Transport
}

describe('bridgeTransports', () => {
  let local: Transport
  let remote: Transport

  beforeEach(() => {
    local = createMockTransport()
    remote = createMockTransport()
  })

  it('calls start() on both transports', async () => {
    await bridgeTransports(local, remote)

    expect(local.start).toHaveBeenCalledOnce()
    expect(remote.start).toHaveBeenCalledOnce()
  })

  it('forwards local messages to remote', async () => {
    await bridgeTransports(local, remote)

    const msg = { jsonrpc: '2.0', method: 'test', id: 1 }
    local.onmessage!(msg as any)

    expect(remote.send).toHaveBeenCalledWith(msg)
  })

  it('forwards remote messages to local', async () => {
    await bridgeTransports(local, remote)

    const msg = { jsonrpc: '2.0', result: {}, id: 1 }
    remote.onmessage!(msg as any)

    expect(local.send).toHaveBeenCalledWith(msg)
  })

  it('closes remote when local closes', async () => {
    await bridgeTransports(local, remote)

    local.onclose!()

    expect(remote.close).toHaveBeenCalledOnce()
  })

  it('closes local when remote closes', async () => {
    await bridgeTransports(local, remote)

    remote.onclose!()

    expect(local.close).toHaveBeenCalledOnce()
  })

  it('closes remote on local error', async () => {
    await bridgeTransports(local, remote)

    local.onerror!(new Error('local broke'))

    expect(remote.close).toHaveBeenCalledOnce()
  })

  it('does not close local on remote error', async () => {
    await bridgeTransports(local, remote)

    remote.onerror!(new Error('remote broke'))

    expect(local.close).not.toHaveBeenCalled()
  })
})
