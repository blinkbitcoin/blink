import { isPrivateIp, isPublicUnicastIp } from "@/domain/accounts-ips"

describe("isPrivateIp", () => {
  it("check ipv6 private address validation", () => {
    const localhost = "::ffff:127.0.0.1"
    expect(isPrivateIp(localhost)).toBeTruthy()
  })

  it("check ipv4 localhost address validation", () => {
    const localhost = "127.0.0.1"
    expect(isPrivateIp(localhost)).toBeTruthy()
  })

  it("check ipv4 private address validation", () => {
    const localhost = "192.168.1.1"
    expect(isPrivateIp(localhost)).toBeTruthy()
  })

  it("check non private IP", () => {
    const localhost = "152.231.190.229"
    expect(isPrivateIp(localhost)).toBeFalsy()
  })
})

describe("isPublicUnicastIp", () => {
  it.each(["8.8.8.8", "93.184.216.34", "2606:4700:4700::1111", "::ffff:8.8.8.8"])(
    "accepts public unicast %s",
    (ip) => {
      expect(isPublicUnicastIp(ip)).toBe(true)
    },
  )

  it.each([
    "127.0.0.1",
    "10.0.0.1",
    "172.16.0.1",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "255.255.255.255",
    "224.0.0.1",
    "::1",
    "::",
    "fe80::1",
    "fc00::1",
    "fd00::1",
    "ff02::1",
    "::ffff:127.0.0.1",
    "::ffff:10.0.0.1",
    "2001:db8::1",
    "3fff::1",
    "64:ff9b::7f00:1",
    "not-an-ip",
    "",
  ])("rejects %s", (ip) => {
    expect(isPublicUnicastIp(ip)).toBe(false)
  })
})
