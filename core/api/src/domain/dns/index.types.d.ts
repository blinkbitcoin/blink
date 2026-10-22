type DnsError = import("./errors").DnsError
type DnsServiceError = import("./errors").DnsServiceError

interface IDnsService {
  lookupAddresses: (hostname: string) => Promise<IpAddress[] | DnsServiceError>
}
