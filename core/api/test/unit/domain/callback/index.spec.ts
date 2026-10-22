import { checkedToCallbackEndpointUrl } from "@/domain/callback"
import { InvalidUrlError } from "@/domain/callback/errors"
import { ErrorLevel } from "@/domain/shared"

describe("checkedToCallbackEndpointUrl", () => {
  it.each([
    "https://example.com",
    "https://example.com/hook",
    "https://example.com:8443/hook",
    "https://example.com./hook",
    "https://93.184.216.34/hook",
    "https://[2606:2800:220:1::1]/hook",
  ])("accepts %s unchanged", (url) => {
    expect(checkedToCallbackEndpointUrl(url)).toBe(url)
  })

  it("rejects an empty url", () => {
    expect(checkedToCallbackEndpointUrl("")).toBeInstanceOf(InvalidUrlError)
  })

  it.each([
    "not a url",
    "http://example.com/hook",
    "ftp://example.com/hook",
    "https://user@example.com/hook",
    "https://user:pass@example.com/hook",
    "https://:pass@example.com/hook",
    "https://127.0.0.1/",
    "https://10.0.0.1/",
    "https://169.254.169.254/",
    "https://[::1]/",
    "https://[::ffff:127.0.0.1]/",
    "https://[fd00::1]/",
    "https://2130706433/",
    "https://0x7f.1/",
    "https://localhost/",
    "https://localhost./",
    "https://kubernetes.default.svc/",
    "https://api.galoy.svc.cluster.local/",
    "https://metadata.google.internal/",
    "https://galoy-pay-fcdf45878-qjxbf:3000/x",
    "https://printer.lan/",
  ])("rejects %p with a generic info-level error", (url) => {
    const result = checkedToCallbackEndpointUrl(url)
    expect(result).toBeInstanceOf(InvalidUrlError)
    if (!(result instanceof Error)) throw new Error("expected an error")
    expect(result.level).toBe(ErrorLevel.Info)
    expect(result.message).not.toContain(url)
  })
})
