import {
  MissingIPMetadataError,
  UnauthorizedIPMetadataASNError,
  UnauthorizedIPMetadataCountryError,
  UnauthorizedIPMetadataProxyError,
} from "@/domain/errors"

export const IPMetadataAuthorizer = ({
  denyCountries,
  allowCountries,
  denyASNs,
  allowASNs,
  checkProxy,
}: IPMetadataAuthorizerArgs): IPMetadataAuthorizer => {
  const authorize = (ipMetadata?: IPType): true | AuthorizationError => {
    if (!ipMetadata || !ipMetadata.isoCode || !ipMetadata.asn)
      return new MissingIPMetadataError()

    if (checkProxy && isHighRiskProxy(ipMetadata)) {
      return new UnauthorizedIPMetadataProxyError()
    }

    const isoCode = ipMetadata.isoCode.toUpperCase()
    const allowedCountry = allowCountries.length <= 0 || allowCountries.includes(isoCode)
    const deniedCountry = denyCountries.length > 0 && denyCountries.includes(isoCode)
    if (!allowedCountry || deniedCountry) return new UnauthorizedIPMetadataCountryError()

    const asn = ipMetadata.asn.toUpperCase()
    const allowedASN = allowASNs.length <= 0 || allowASNs.includes(asn)
    const deniedASN = denyASNs.length > 0 && denyASNs.includes(asn)
    if (!allowedASN || deniedASN) return new UnauthorizedIPMetadataASNError()

    return true
  }

  return { authorize }
}

const isHighRiskProxy = (ipMetadata: IPType): boolean => {
  const { risk, proxy, type } = ipMetadata

  if (!risk) {
    return false
  }

  if (risk >= 74) {
    return true
  }

  if (type === undefined || proxy === undefined) {
    return false
  }

  if (risk >= 67) {
    return !(proxy && type === "VPN")
  }

  return proxy && type !== "VPN"
}
