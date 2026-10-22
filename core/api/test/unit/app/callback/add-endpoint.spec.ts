import { addEndpoint } from "@/app/callback"
import { InvalidUrlError } from "@/domain/callback/errors"
import { DnsLookupError } from "@/domain/dns"
import { ErrorLevel } from "@/domain/shared"
import { DnsService } from "@/services/dns"
import { CallbackService } from "@/services/svix"

const mockFlag = { value: false }

jest.mock("@/config", () => ({
  getCallbackServiceConfig: jest.fn(() => ({ secret: "secret" })),
  get UNSECURE_CALLBACK_ENDPOINT_URLS() {
    return mockFlag.value
  },
}))

jest.mock("@/services/dns", () => ({
  DnsService: jest.fn(),
}))

jest.mock("@/services/svix", () => ({
  CallbackService: jest.fn(),
}))

const accountId = "4b5a4bb8-3a17-4b2a-a9a5-7e5a3a1e8c5f"
const lookupAddresses = jest.fn()
const svixAddEndpoint = jest.fn()

const expectRejected = (result: unknown, url: string) => {
  expect(result).toBeInstanceOf(InvalidUrlError)
  if (!(result instanceof InvalidUrlError)) throw new Error("expected InvalidUrlError")
  expect(result.level).toBe(ErrorLevel.Info)
  expect(result.message).not.toContain(url)
  expect(svixAddEndpoint).not.toHaveBeenCalled()
}

beforeEach(() => {
  jest.resetAllMocks()
  mockFlag.value = false
  ;(DnsService as jest.Mock).mockReturnValue({ lookupAddresses })
  ;(CallbackService as jest.Mock).mockReturnValue({ addEndpoint: svixAddEndpoint })
  svixAddEndpoint.mockResolvedValue("ep_123")
})

describe("addEndpoint", () => {
  it.each([
    ["https://example.com/hook", ["93.184.216.34", "2606:2800:220:1::1"]],
    ["https://example.com:8443/hook", ["93.184.216.34"]],
  ])("registers public https url %s", async (url, addresses) => {
    lookupAddresses.mockResolvedValue(addresses)

    const result = await addEndpoint({ accountId, url })

    expect(result).toEqual({ id: "ep_123" })
    expect(lookupAddresses).toHaveBeenCalledWith("example.com")
    expect(svixAddEndpoint).toHaveBeenCalledWith({ accountId, url })
  })

  it.each(["http://example.com/hook", "https://user@example.com/hook", "not a url"])(
    "rejects %s before resolving",
    async (url) => {
      const result = await addEndpoint({ accountId, url })

      expectRejected(result, url)
      expect(lookupAddresses).not.toHaveBeenCalled()
    },
  )

  it.each([
    ["https://127.0.0.1/", "127.0.0.1"],
    ["https://10.0.0.1/", "10.0.0.1"],
    ["https://169.254.169.254/", "169.254.169.254"],
    ["https://[::1]/", "::1"],
    ["https://[::ffff:127.0.0.1]/", "::ffff:7f00:1"],
    ["https://2130706433/", "127.0.0.1"],
    ["https://0x7f.1/", "127.0.0.1"],
  ])("rejects private literal %s", async (url, hostname) => {
    lookupAddresses.mockResolvedValue([hostname])

    const result = await addEndpoint({ accountId, url })

    expect(lookupAddresses).toHaveBeenCalledWith(hostname)
    expectRejected(result, url)
  })

  it.each([
    ["https://127.0.0.1.nip.io/", ["127.0.0.1"]],
    ["https://kubernetes.default.svc/", ["10.96.0.1"]],
    ["https://mixed.example.com/", ["93.184.216.34", "10.0.0.1"]],
  ])("rejects %s resolving to a non-public address", async (url, addresses) => {
    lookupAddresses.mockResolvedValue(addresses)

    const result = await addEndpoint({ accountId, url })

    expect(lookupAddresses).toHaveBeenCalledTimes(1)
    expectRejected(result, url)
  })

  it("rejects when the lookup fails", async () => {
    const url = "https://nxdomain.example.com/"
    lookupAddresses.mockResolvedValue(new DnsLookupError("ENOTFOUND"))

    const result = await addEndpoint({ accountId, url })

    expect(lookupAddresses).toHaveBeenCalledWith("nxdomain.example.com")
    expectRejected(result, url)
  })

  it("skips the destination check when the dev flag is on", async () => {
    mockFlag.value = true
    const url = "http://bats-tests:8080/webhook/"

    const result = await addEndpoint({ accountId, url })

    expect(result).toEqual({ id: "ep_123" })
    expect(lookupAddresses).not.toHaveBeenCalled()
    expect(svixAddEndpoint).toHaveBeenCalledWith({ accountId, url })
  })
})
