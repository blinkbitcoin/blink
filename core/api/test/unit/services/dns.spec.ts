import { DnsLookupError } from "@/domain/dns"
import { DnsService } from "@/services/dns"

type Address = { address: string; family: number }

const mockLookup = jest.fn<Promise<Address[]>, [string, object]>()
jest.mock("node:dns/promises", () => ({
  lookup: (...args: [string, object]) => mockLookup(...args),
}))
jest.mock("@/services/tracing", () => ({
  wrapAsyncFunctionsToRunInSpan: ({ fns }: { fns: unknown }) => fns,
}))

beforeEach(() => {
  mockLookup.mockReset()
})

describe("DnsService.lookupAddresses", () => {
  it.each(["127.0.0.1", "::1"])("returns literal %s without resolving", async (ip) => {
    expect(await DnsService().lookupAddresses(ip)).toEqual([ip])
    expect(mockLookup).not.toHaveBeenCalled()
  })

  it("returns every resolved address", async () => {
    mockLookup.mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
      { address: "10.0.0.1", family: 4 },
    ])

    const result = await DnsService().lookupAddresses("example.com")

    expect(result).toEqual(["93.184.216.34", "10.0.0.1"])
    expect(mockLookup).toHaveBeenCalledWith("example.com", { all: true, verbatim: true })
  })

  it("returns an error on lookup failure", async () => {
    mockLookup.mockRejectedValue(new Error("getaddrinfo ENOTFOUND"))

    expect(await DnsService().lookupAddresses("nx.example")).toBeInstanceOf(
      DnsLookupError,
    )
  })

  it("returns an error on empty answers", async () => {
    mockLookup.mockResolvedValue([])

    expect(await DnsService().lookupAddresses("empty.example")).toBeInstanceOf(
      DnsLookupError,
    )
  })

  it("returns an error on malformed answers", async () => {
    mockLookup.mockResolvedValue([{ address: "not-an-ip", family: 4 }])

    expect(await DnsService().lookupAddresses("bad.example")).toBeInstanceOf(
      DnsLookupError,
    )
  })

  it("returns an error when the lookup does not answer in time", async () => {
    jest.useFakeTimers()
    try {
      mockLookup.mockReturnValue(new Promise(() => undefined))

      const pending = DnsService().lookupAddresses("slow.example")
      await jest.advanceTimersByTimeAsync(3_000)

      expect(await pending).toBeInstanceOf(DnsLookupError)
      expect(jest.getTimerCount()).toBe(0)
    } finally {
      jest.useRealTimers()
    }
  })

  it("clears the timeout after an answer", async () => {
    jest.useFakeTimers()
    try {
      mockLookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }])

      await DnsService().lookupAddresses("example.com")

      expect(jest.getTimerCount()).toBe(0)
    } finally {
      jest.useRealTimers()
    }
  })
})
