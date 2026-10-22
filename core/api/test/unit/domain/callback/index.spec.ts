import { checkedToCallbackEndpointUrl } from "@/domain/callback"
import { InvalidUrlError } from "@/domain/callback/errors"
import { ErrorLevel } from "@/domain/shared"

describe("checkedToCallbackEndpointUrl", () => {
  it.each([
    ["https://example.com/hook", "example.com"],
    ["https://example.com:8443/hook", "example.com"],
    ["https://127.0.0.1/", "127.0.0.1"],
    ["https://[::1]/", "::1"],
    ["https://2130706433/", "127.0.0.1"],
    ["https://0x7f.1/", "127.0.0.1"],
  ])("parses %s", (url, hostname) => {
    const result = checkedToCallbackEndpointUrl(url)
    if (result instanceof Error) throw result
    expect(result.hostname).toBe(hostname)
  })

  it.each(["https://example.com", "https://example.com:8443/hook"])(
    "returns %s unchanged",
    (url) => {
      const result = checkedToCallbackEndpointUrl(url)
      if (result instanceof Error) throw result
      expect(result.url).toBe(url)
    },
  )

  it.each([
    "not a url",
    "http://example.com/hook",
    "ftp://example.com/hook",
    "https://user@example.com/hook",
    "https://user:pass@example.com/hook",
    "https://:pass@example.com/hook",
  ])("rejects %s with a generic info-level error", (url) => {
    const result = checkedToCallbackEndpointUrl(url)
    expect(result).toBeInstanceOf(InvalidUrlError)
    if (!(result instanceof Error)) throw new Error("expected an error")
    expect(result.level).toBe(ErrorLevel.Info)
    expect(result.message).not.toContain(url)
  })

  it("rejects an empty url", () => {
    expect(checkedToCallbackEndpointUrl("")).toBeInstanceOf(InvalidUrlError)
  })
})
