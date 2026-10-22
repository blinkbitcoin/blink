import { lookup } from "node:dns/promises"
import { isIP } from "node:net"

import { DnsLookupError } from "@/domain/dns"
import { wrapAsyncFunctionsToRunInSpan } from "@/services/tracing"

const TIMEOUT_MS = 3_000

export const DnsService = (): IDnsService => {
  const lookupAddresses = async (
    hostname: string,
  ): Promise<IpAddress[] | DnsServiceError> => {
    if (isIP(hostname)) return [hostname as IpAddress]

    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const timeout = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("DNS lookup timed out")), TIMEOUT_MS)
      })
      const answers = await Promise.race([
        lookup(hostname, { all: true, verbatim: true }),
        timeout,
      ])
      const valid = answers.every(({ address, family }) => isIP(address) === family)
      if (answers.length === 0 || !valid) return new DnsLookupError("Invalid answers")

      return answers.map(({ address }) => address as IpAddress)
    } catch (err) {
      return new DnsLookupError(err)
    } finally {
      clearTimeout(timer)
    }
  }

  return wrapAsyncFunctionsToRunInSpan({
    namespace: "services.dns",
    fns: { lookupAddresses },
  })
}
