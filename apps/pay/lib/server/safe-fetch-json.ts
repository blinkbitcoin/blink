import { lookup } from "node:dns/promises"
import https from "node:https"
import { isIP, type LookupFunction } from "node:net"

const MAX_REDIRECTS = 3
const MAX_BODY_BYTES = 16 * 1024
const TIMEOUT_MS = 5_000
const DEADLINE_MS = 15_000

export class SafeFetchError extends Error {}

const BLOCKED_V4: Array<[number, number]> = [
  [0x00000000, 0xff000000],
  [0x0a000000, 0xff000000],
  [0x64400000, 0xffc00000],
  [0x7f000000, 0xff000000],
  [0xa9fe0000, 0xffff0000],
  [0xac100000, 0xfff00000],
  [0xc0000000, 0xffffff00],
  [0xc0000200, 0xffffff00],
  [0xc0586300, 0xffffff00],
  [0xc0a80000, 0xffff0000],
  [0xc6120000, 0xfffe0000],
  [0xc6336400, 0xffffff00],
  [0xcb007100, 0xffffff00],
  [0xe0000000, 0xf0000000],
  [0xf0000000, 0xf0000000],
]

const ipv4ToInt = (ip: string): number =>
  ip.split(".").reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0

const isBlockedIpv4 = (ip: string): boolean => {
  const address = ipv4ToInt(ip)
  return BLOCKED_V4.some(([network, mask]) => (address & mask) >>> 0 === network)
}

const mappedIpv4 = (ip: string): string | null => {
  const match = ip.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i)
  if (!match) return null

  const high = Number.parseInt(match[1], 16)
  const low = Number.parseInt(match[2], 16)
  return `${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`
}

const isBlockedIpv6 = (ip: string): boolean => {
  const mapped = mappedIpv4(ip)
  if (mapped) return isBlockedIpv4(mapped)

  const firstGroup = Number.parseInt(ip.split(":")[0] || "0", 16)
  if (Number.isNaN(firstGroup) || (firstGroup & 0xe000) !== 0x2000) return true

  if (/^2001:db8:/i.test(ip)) return true
  if (firstGroup !== 0x3fff) return false

  const secondGroup = Number.parseInt(ip.split(":")[1] || "0", 16)
  return secondGroup <= 0x0fff
}

const isBlockedAddress = ({
  address,
  family,
}: {
  address: string
  family: number
}): boolean => {
  if (family === 4) return isBlockedIpv4(address)
  if (family === 6) return isBlockedIpv6(address)
  return true
}

type ResolvedAddress = { address: string; family: number }

const resolveAllowedAddresses = async (hostname: string): Promise<ResolvedAddress[]> => {
  const unwrappedHostname = hostname.replace(/^\[|\]$/g, "")
  const literalFamily = isIP(unwrappedHostname)
  const addresses = literalFamily
    ? [{ address: unwrappedHostname, family: literalFamily }]
    : await lookup(unwrappedHostname, { all: true, verbatim: true })
  const allowed = addresses.filter(
    ({ address, family }) => !isBlockedAddress({ address, family }),
  )

  if (allowed.length === 0) {
    throw new SafeFetchError("hostname does not resolve to a public address")
  }

  return allowed
}

const pinnedLookup =
  (addresses: ResolvedAddress[]): LookupFunction =>
  (_hostname, options, callback) => {
    const matching = options.family
      ? addresses.filter(({ family }) => family === options.family)
      : addresses

    if (matching.length === 0) {
      callback(new SafeFetchError("no address matches the requested family"), "")
      return
    }

    if (options.all) {
      callback(null, matching)
      return
    }

    callback(null, matching[0].address, matching[0].family)
  }

const requestJsonOnce = async ({
  url,
  redirectsLeft,
  signal,
}: {
  url: URL
  redirectsLeft: number
  signal: AbortSignal
}): Promise<{ data: unknown } | { redirect: URL }> => {
  if (url.protocol !== "https:") {
    throw new SafeFetchError("only https URLs are allowed")
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, "")
  const addresses = await resolveAllowedAddresses(hostname)

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname,
        port: url.port || 443,
        path: `${url.pathname}${url.search}`,
        method: "GET",
        lookup: pinnedLookup(addresses),
        headers: { "Accept": "application/json", "User-Agent": "blink-pay/1.0" },
        timeout: TIMEOUT_MS,
        signal,
      },
      (res) => {
        const status = res.statusCode ?? 0

        if ([301, 302, 303, 307, 308].includes(status)) {
          res.resume()
          if (redirectsLeft <= 0) {
            reject(new SafeFetchError("too many redirects"))
            return
          }

          const location = res.headers.location
          if (!location) {
            reject(new SafeFetchError("redirect without a location"))
            return
          }

          try {
            resolve({ redirect: new URL(location, url) })
          } catch {
            reject(new SafeFetchError("invalid redirect target"))
          }
          return
        }

        if (status < 200 || status >= 300) {
          res.resume()
          reject(new SafeFetchError(`upstream returned HTTP ${status}`))
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
            req.destroy(new SafeFetchError("response too large"))
            return
          }
          chunks.push(Uint8Array.from(chunk))
        })
        res.on("end", () => {
          if (stopped) return

          try {
            resolve({ data: JSON.parse(Buffer.concat(chunks).toString("utf8")) })
          } catch {
            reject(new SafeFetchError("invalid JSON from upstream"))
          }
        })
        res.on("error", reject)
      },
    )

    req.on("timeout", () => req.destroy(new SafeFetchError("upstream request timed out")))
    req.on("error", reject)
    req.end()
  })
}

type SafeFetchJsonResponse = { data: unknown; url: string }

const fetchWithRedirects = async ({
  url,
  redirectsLeft,
  signal,
}: {
  url: URL
  redirectsLeft: number
  signal: AbortSignal
}): Promise<SafeFetchJsonResponse> => {
  const result = await requestJsonOnce({ url, redirectsLeft, signal })
  if ("data" in result) return { data: result.data, url: url.toString() }
  return fetchWithRedirects({
    url: result.redirect,
    redirectsLeft: redirectsLeft - 1,
    signal,
  })
}

const withRequestDeadline = ({
  controller,
  operation,
}: {
  controller: AbortController
  operation: () => Promise<SafeFetchJsonResponse>
}): Promise<SafeFetchJsonResponse> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new SafeFetchError("upstream request deadline exceeded"))
      controller.abort()
    }, DEADLINE_MS)
    operation().then(
      (result) => {
        clearTimeout(timer)
        resolve(result)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })

export const safeFetchJsonResponse = async (
  input: string,
): Promise<SafeFetchJsonResponse> => {
  let url: URL
  try {
    url = new URL(input)
  } catch {
    throw new SafeFetchError("invalid URL")
  }

  const controller = new AbortController()

  try {
    return await withRequestDeadline({
      controller,
      operation: () =>
        fetchWithRedirects({
          url,
          redirectsLeft: MAX_REDIRECTS,
          signal: controller.signal,
        }),
    })
  } catch (error) {
    if (error instanceof SafeFetchError) throw error
    throw new SafeFetchError("upstream request failed")
  }
}

export const safeFetchJson = async (input: string): Promise<unknown> =>
  (await safeFetchJsonResponse(input)).data
