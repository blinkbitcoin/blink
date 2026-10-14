import { USER_AGENT_MAX_LENGTH, normalizeUserAgent } from "@/domain/phone-provider"

describe("normalizeUserAgent", () => {
  it("returns the user agent unchanged", () => {
    const ua = "Mozilla/5.0 (X11; Linux x86_64) Firefox/131.0"
    expect(normalizeUserAgent(ua)).toEqual(ua)
  })

  it("trims surrounding whitespace", () => {
    expect(normalizeUserAgent("  okhttp/4.12.0 \t")).toEqual("okhttp/4.12.0")
  })

  it.each([undefined, "", "   "])("omits empty user agent %p", (ua) => {
    expect(normalizeUserAgent(ua)).toBeUndefined()
  })

  it("truncates oversized user agent to the cap", () => {
    const ua = "a".repeat(USER_AGENT_MAX_LENGTH + 100)
    expect(normalizeUserAgent(ua)).toEqual("a".repeat(USER_AGENT_MAX_LENGTH))
  })

  it("keeps a user agent of exactly the cap", () => {
    const ua = "b".repeat(USER_AGENT_MAX_LENGTH)
    expect(normalizeUserAgent(ua)).toEqual(ua)
  })
})
