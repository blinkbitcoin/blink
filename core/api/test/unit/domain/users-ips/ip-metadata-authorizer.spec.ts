import {
  UnauthorizedIPMetadataASNError,
  MissingIPMetadataError,
  UnauthorizedIPMetadataCountryError,
  UnauthorizedIPMetadataProxyError,
} from "@/domain/errors"
import { IPMetadataAuthorizer } from "@/domain/accounts-ips/ip-metadata-authorizer"

const defaultConfig = {
  denyCountries: [],
  allowCountries: [],
  denyASNs: [],
  allowASNs: [],
  checkProxy: true,
}

const defaultIpInfo: IPType = {
  provider: "ISP",
  country: "United States",
  isoCode: "US",
  region: "Florida",
  city: "Miami",
  asn: "AS60068",
  proxy: false,
  risk: 50,
  type: "Wireless",
}

describe("IPMetadataAuthorizer", () => {
  describe("validate", () => {
    it("returns true for empty config", () => {
      const authorized = IPMetadataAuthorizer(defaultConfig).authorize(defaultIpInfo)
      expect(authorized).toBe(true)
    })

    it("returns true for an allowed country", () => {
      const config = { ...defaultConfig, allowCountries: ["US"] }
      const authorized = IPMetadataAuthorizer(config).authorize(defaultIpInfo)
      expect(authorized).toBe(true)
    })

    it("returns true for a country not defined in deny-list", () => {
      const config = { ...defaultConfig, denyCountries: ["AF"] }
      const authorized = IPMetadataAuthorizer(config).authorize(defaultIpInfo)
      expect(authorized).toBe(true)
    })

    it("returns true for an allowed asn", () => {
      const config = { ...defaultConfig, allowASNs: ["AS60068"] }
      const authorized = IPMetadataAuthorizer(config).authorize(defaultIpInfo)
      expect(authorized).toBe(true)
    })

    it("returns true for an ASN not defined in deny-list", () => {
      const config = { ...defaultConfig, denyASNs: ["AS60067"] }
      const authorized = IPMetadataAuthorizer(config).authorize(defaultIpInfo)
      expect(authorized).toBe(true)
    })

    it("returns true for proxy/vpn if check proxy is disabled", () => {
      const ipInfo = { ...defaultIpInfo, proxy: true, risk: 80, type: "other" }
      const config = { ...defaultConfig, checkProxy: false }
      const authorized = IPMetadataAuthorizer(config).authorize(ipInfo)
      expect(authorized).toBe(true)
    })

    it("returns error for a country not defined in allow-list", () => {
      const config = { ...defaultConfig, allowCountries: ["US"] }
      const ipInfo = { ...defaultIpInfo, isoCode: "AF" }
      const authorized = IPMetadataAuthorizer(config).authorize(ipInfo)
      expect(authorized).toBeInstanceOf(UnauthorizedIPMetadataCountryError)
    })

    it("returns error for an ASN not defined in allow-list", () => {
      const config = { ...defaultConfig, allowASNs: ["AS60068"] }
      const ipInfo = { ...defaultIpInfo, asn: "AS60067" }
      const authorized = IPMetadataAuthorizer(config).authorize(ipInfo)
      expect(authorized).toBeInstanceOf(UnauthorizedIPMetadataASNError)
    })

    it("returns error for empty isoCode", () => {
      const ipInfo = { ...defaultIpInfo, isoCode: undefined }
      let authorized = IPMetadataAuthorizer(defaultConfig).authorize(ipInfo)
      expect(authorized).toBeInstanceOf(MissingIPMetadataError)

      const ipInfo1 = { ...defaultIpInfo, isoCode: "" }
      authorized = IPMetadataAuthorizer(defaultConfig).authorize(ipInfo1)
      expect(authorized).toBeInstanceOf(MissingIPMetadataError)
    })

    it("returns error for empty asn", () => {
      const ipInfo = { ...defaultIpInfo, asn: undefined }
      let authorized = IPMetadataAuthorizer(defaultConfig).authorize(ipInfo)
      expect(authorized).toBeInstanceOf(MissingIPMetadataError)

      const ipInfo1 = { ...defaultIpInfo, asn: "" }
      authorized = IPMetadataAuthorizer(defaultConfig).authorize(ipInfo1)
      expect(authorized).toBeInstanceOf(MissingIPMetadataError)
    })

    it("returns error for a denied country", () => {
      const config = { ...defaultConfig, denyCountries: ["US"] }
      const authorized = IPMetadataAuthorizer(config).authorize(defaultIpInfo)
      expect(authorized).toBeInstanceOf(UnauthorizedIPMetadataCountryError)
    })

    it("returns error for a denied asn", () => {
      const config = { ...defaultConfig, denyASNs: ["AS60068"] }
      const authorized = IPMetadataAuthorizer(config).authorize(defaultIpInfo)
      expect(authorized).toBeInstanceOf(UnauthorizedIPMetadataASNError)
    })

    it("returns error for a denied/allowed country", () => {
      const config = {
        ...defaultConfig,
        denyCountries: ["US"],
        allowCountries: ["US"],
      }
      const authorized = IPMetadataAuthorizer(config).authorize(defaultIpInfo)
      expect(authorized).toBeInstanceOf(UnauthorizedIPMetadataCountryError)
    })

    it("returns error for a denied/allowed asn", () => {
      const config = {
        ...defaultConfig,
        denyASNs: ["AS60068"],
        allowASNs: ["AS60068"],
      }
      const authorized = IPMetadataAuthorizer(config).authorize(defaultIpInfo)
      expect(authorized).toBeInstanceOf(UnauthorizedIPMetadataASNError)
    })

    it("returns error for a denied asn and allowed country", () => {
      const config = {
        ...defaultConfig,
        denyASNs: ["AS60068"],
        allowCountries: ["US"],
      }
      const authorized = IPMetadataAuthorizer(config).authorize(defaultIpInfo)
      expect(authorized).toBeInstanceOf(UnauthorizedIPMetadataASNError)
    })

    it("returns error for a denied country and allowed asn", () => {
      const config = {
        ...defaultConfig,
        allowASNs: ["AS60068"],
        denyCountries: ["US"],
      }
      const authorized = IPMetadataAuthorizer(config).authorize(defaultIpInfo)
      expect(authorized).toBeInstanceOf(UnauthorizedIPMetadataCountryError)
    })

    it("returns true for low risk with no proxy", () => {
      const ipInfo = { ...defaultIpInfo, proxy: false, risk: 50 }
      const authorized = IPMetadataAuthorizer(defaultConfig).authorize(ipInfo)
      expect(authorized).toBe(true)
    })

    it("returns true for low risk with VPN proxy", () => {
      const ipInfo = { ...defaultIpInfo, proxy: true, risk: 50, type: "VPN" }
      const authorized = IPMetadataAuthorizer(defaultConfig).authorize(ipInfo)
      expect(authorized).toBe(true)
    })

    it("returns error for low risk with non-VPN proxy", () => {
      const ipInfo = { ...defaultIpInfo, proxy: true, risk: 50, type: "other" }
      const authorized = IPMetadataAuthorizer(defaultConfig).authorize(ipInfo)
      expect(authorized).toBeInstanceOf(UnauthorizedIPMetadataProxyError)
    })

    it("returns true for medium risk with VPN proxy", () => {
      const ipInfo = { ...defaultIpInfo, proxy: true, risk: 70, type: "VPN" }
      const authorized = IPMetadataAuthorizer(defaultConfig).authorize(ipInfo)
      expect(authorized).toBe(true)
    })

    it("returns error for medium risk with no proxy", () => {
      const ipInfo = { ...defaultIpInfo, proxy: false, risk: 70 }
      const authorized = IPMetadataAuthorizer(defaultConfig).authorize(ipInfo)
      expect(authorized).toBeInstanceOf(UnauthorizedIPMetadataProxyError)
    })

    it("returns error for medium risk with non-VPN proxy", () => {
      const ipInfo = { ...defaultIpInfo, proxy: true, risk: 70, type: "other" }
      const authorized = IPMetadataAuthorizer(defaultConfig).authorize(ipInfo)
      expect(authorized).toBeInstanceOf(UnauthorizedIPMetadataProxyError)
    })

    it("returns error for high risk regardless of proxy", () => {
      const ipInfo = { ...defaultIpInfo, proxy: true, risk: 80, type: "VPN" }
      const authorized = IPMetadataAuthorizer(defaultConfig).authorize(ipInfo)
      expect(authorized).toBeInstanceOf(UnauthorizedIPMetadataProxyError)
    })

    it("returns error for high risk with no proxy", () => {
      const ipInfo = { ...defaultIpInfo, proxy: false, risk: 80 }
      const authorized = IPMetadataAuthorizer(defaultConfig).authorize(ipInfo)
      expect(authorized).toBeInstanceOf(UnauthorizedIPMetadataProxyError)
    })

    it("returns error for high risk with non-VPN proxy", () => {
      let ipInfo: IPType = { ...defaultIpInfo, proxy: true, risk: 80, type: "other" }
      let authorized = IPMetadataAuthorizer(defaultConfig).authorize(ipInfo)
      expect(authorized).toBeInstanceOf(UnauthorizedIPMetadataProxyError)

      ipInfo = { ...defaultIpInfo, proxy: true, risk: 80, type: undefined }
      authorized = IPMetadataAuthorizer(defaultConfig).authorize(ipInfo)
      expect(authorized).toBeInstanceOf(UnauthorizedIPMetadataProxyError)

      ipInfo = { ...defaultIpInfo, proxy: undefined, risk: 80, type: "other" }
      authorized = IPMetadataAuthorizer(defaultConfig).authorize(ipInfo)
      expect(authorized).toBeInstanceOf(UnauthorizedIPMetadataProxyError)

      ipInfo = { ...defaultIpInfo, proxy: undefined, risk: 80, type: undefined }
      authorized = IPMetadataAuthorizer(defaultConfig).authorize(ipInfo)
      expect(authorized).toBeInstanceOf(UnauthorizedIPMetadataProxyError)
    })

    it("returns true for risk 66 with no proxy", () => {
      const ipInfo = { ...defaultIpInfo, proxy: false, risk: 66 }
      const authorized = IPMetadataAuthorizer(defaultConfig).authorize(ipInfo)
      expect(authorized).toBe(true)
    })

    it("returns error for risk 67 with no proxy", () => {
      const ipInfo = { ...defaultIpInfo, proxy: false, risk: 67 }
      const authorized = IPMetadataAuthorizer(defaultConfig).authorize(ipInfo)
      expect(authorized).toBeInstanceOf(UnauthorizedIPMetadataProxyError)
    })

    it("returns true for risk 73 with VPN proxy", () => {
      const ipInfo = { ...defaultIpInfo, proxy: true, risk: 73, type: "VPN" }
      const authorized = IPMetadataAuthorizer(defaultConfig).authorize(ipInfo)
      expect(authorized).toBe(true)
    })

    it("returns error for risk 74 with VPN proxy", () => {
      const ipInfo = { ...defaultIpInfo, proxy: true, risk: 74, type: "VPN" }
      const authorized = IPMetadataAuthorizer(defaultConfig).authorize(ipInfo)
      expect(authorized).toBeInstanceOf(UnauthorizedIPMetadataProxyError)
    })

    it("returns true for missing risk data", () => {
      const ipInfo = { ...defaultIpInfo, proxy: true, risk: undefined, type: "other" }
      const authorized = IPMetadataAuthorizer(defaultConfig).authorize(ipInfo)
      expect(authorized).toBe(true)
    })

    it("returns true for missing proxy data", () => {
      const ipInfo = { ...defaultIpInfo, proxy: undefined, risk: 70, type: "other" }
      const authorized = IPMetadataAuthorizer(defaultConfig).authorize(ipInfo)
      expect(authorized).toBe(true)
    })

    it("returns true for missing type data", () => {
      const ipInfo = { ...defaultIpInfo, proxy: true, risk: 70, type: undefined }
      const authorized = IPMetadataAuthorizer(defaultConfig).authorize(ipInfo)
      expect(authorized).toBe(true)
    })
  })
})
