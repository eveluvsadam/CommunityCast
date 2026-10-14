import { networkInterfaces } from 'os'

/**
 * Best-effort detection of this machine's LAN-facing IPv4 address (the
 * 192.168.x.x / 10.x.x.x / 172.16-31.x.x style address other devices on the
 * same network would use to reach it) — as opposed to 127.0.0.1, which only
 * ever means "this machine" and is useless from anywhere else.
 *
 * Returns null rather than guessing if nothing obviously LAN-like is found
 * (e.g. no network connection) — better to show nothing than a wrong address.
 */
export function getLanIp(): string | null {
  const interfaces = networkInterfaces()

  for (const name of Object.keys(interfaces)) {
    const addresses = interfaces[name]
    if (!addresses) continue
    for (const addr of addresses) {
      if (addr.family === 'IPv4' && !addr.internal) {
        return addr.address
      }
    }
  }

  return null
}
