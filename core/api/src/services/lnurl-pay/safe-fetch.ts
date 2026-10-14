import { lookup } from "node:dns/promises"
import https from "node:https"
import { isIP, type LookupFunction } from "node:net"

import ipaddr from "ipaddr.js"

const MAX_REDIRECTS = 3
const MAX_BODY_BYTES = 1024 * 1024
const TIMEOUT_MS = 5_000
const DEADLINE_MS = 15_000

type Address = { address: string; family: number }

const failure = () => new Error("LNURL service unreachable or not allowed")

const isPublicAddress = ({ address, family }: Address): boolean => {
  if (isIP(address) !== family) return false
  const parsed = ipaddr.process(address)
  if (parsed.range() !== "unicast") return false
  // Restrict IPv6 to global unicast and exclude the newer documentation range.
  return (
    parsed.kind() === "ipv4" ||
    (parsed.match(ipaddr.parseCIDR("2000::/3")) &&
      !parsed.match(ipaddr.parseCIDR("3fff::/20")))
  )
}

const resolvePublicAddresses = async (hostname: string): Promise<Address[]> => {
  const family = isIP(hostname)
  const addresses = family
    ? [{ address: hostname, family }]
    : await lookup(hostname, { all: true, verbatim: true })
  // Fail closed on mixed public/private answers instead of selecting a subset.
  if (addresses.length === 0 || !addresses.every(isPublicAddress)) throw failure()
  return addresses
}

const pinnedLookup =
  (addresses: Address[]): LookupFunction =>
  (_hostname, options, callback) => {
    const matching = options.family
      ? addresses.filter(({ family }) => family === options.family)
      : addresses
    if (matching.length === 0) {
      callback(failure(), "")
    } else if (options.all) {
      callback(null, matching)
    } else {
      callback(null, matching[0].address, matching[0].family)
    }
  }

const requestJson = async (
  url: URL,
  signal: AbortSignal,
): Promise<{ data: unknown } | { redirect: URL }> => {
  if (url.protocol !== "https:" || url.port || url.username || url.password) {
    throw failure()
  }
  signal.throwIfAborted()
  const hostname = url.hostname.replace(/^\[|\]$/g, "")
  const addresses = await resolvePublicAddresses(hostname)
  // DNS itself cannot be cancelled; never open a socket after its deadline.
  signal.throwIfAborted()

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname,
        port: 443,
        path: `${url.pathname}${url.search}`,
        method: "GET",
        lookup: pinnedLookup(addresses),
        // Do not reuse a socket established outside this validation boundary.
        agent: false,
        headers: { "Accept": "application/json", "User-Agent": "blink-core/1.0" },
        timeout: TIMEOUT_MS,
        signal,
      },
      (res) => {
        // Install before rejecting/destroying to handle late stream errors.
        res.on("error", reject)
        const status = res.statusCode ?? 0
        if ([301, 302, 303, 307, 308].includes(status)) {
          res.destroy()
          try {
            if (!res.headers.location) throw failure()
            resolve({ redirect: new URL(res.headers.location, url) })
          } catch {
            reject(failure())
          }
          return
        }
        if (status < 200 || status >= 300) {
          res.destroy()
          reject(failure())
          return
        }

        const chunks: Uint8Array[] = []
        let size = 0
        let stopped = false
        res.on("data", (chunk: Buffer) => {
          if (stopped) return
          size += chunk.length
          if (size > MAX_BODY_BYTES) {
            stopped = true
            reject(failure())
            req.destroy()
            return
          }
          chunks.push(chunk)
        })
        res.on("end", () => {
          if (stopped) return
          try {
            resolve({ data: JSON.parse(Buffer.concat(chunks).toString("utf8")) })
          } catch {
            reject(failure())
          }
        })
      },
    )
    req.on("timeout", () => req.destroy(failure()))
    req.on("error", reject)
    req.end()
  })
}

// The library uses this hook for discovery AND invoice callbacks. Each redirect
// gets fresh validation and a pinned lookup, including redirects to the same host.
export const safeFetchGet = async ({
  url,
  params = {},
}: {
  url: string
  params?: Record<string, string | number>
}): Promise<Record<string, unknown>> => {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    let target = new URL(url)
    for (const [key, value] of Object.entries(params)) {
      target.searchParams.set(key, String(value))
    }
    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        controller.abort()
        reject(failure())
      }, DEADLINE_MS)
    })
    for (let redirects = 0; ; redirects += 1) {
      const result = await Promise.race([
        requestJson(target, controller.signal),
        deadline,
      ])
      if ("data" in result) {
        if (
          typeof result.data !== "object" ||
          result.data === null ||
          Array.isArray(result.data)
        ) {
          throw failure()
        }
        if ("status" in result.data && result.data.status === "ERROR") throw failure()
        return result.data as Record<string, unknown>
      }
      if (redirects >= MAX_REDIRECTS) throw failure()
      target = result.redirect
    }
  } catch {
    throw failure()
  } finally {
    clearTimeout(timer)
    controller.abort()
  }
}
