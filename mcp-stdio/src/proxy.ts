import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'

export async function bridgeTransports(
  local: Transport,
  remote: Transport,
): Promise<void> {
  local.onmessage = (message) => {
    remote.send(message).catch((err) => {
      console.error('Error forwarding to remote:', err)
    })
  }

  remote.onmessage = (message) => {
    local.send(message).catch((err) => {
      console.error('Error forwarding to local:', err)
    })
  }

  local.onclose = () => {
    remote.close().catch(() => {})
  }

  remote.onclose = () => {
    local.close().catch(() => {})
  }

  local.onerror = (err) => {
    console.error('Local transport error:', err)
    remote.close().catch(() => {})
  }

  remote.onerror = (err) => {
    console.error('Remote transport error:', err)
    local.close().catch(() => {})
  }

  await Promise.all([local.start(), remote.start()])
}
