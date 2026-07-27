jest.mock("@/env", () => ({
  env: {
    WELL_KNOWN_LNURL_URL: "https://blink.sv",
    BLINK_TERMINAL_URL: "https://terminal.blinkbtc.com",
  },
}))

import { migratedTerminalUrl } from "@/app/[username]/migrated-terminal-url"

// This app's tsconfig program includes Cypress (Chai) types, whose global
// `expect` shadows jest's — re-alias it to jest's Expect type for this file.
const expect = globalThis.expect as unknown as jest.Expect

const mockFetch = jest.fn()
global.fetch = mockFetch

const jsonResponse = (body: unknown, ok = true) => ({
  ok,
  json: async () => body,
})

describe("migratedTerminalUrl", () => {
  it("returns the Terminal URL when the username is registered (payRequest)", async () => {
    mockFetch.mockResolvedValue(jsonResponse({ tag: "payRequest" }))
    await expect(migratedTerminalUrl("alice")).resolves.toBe(
      "https://terminal.blinkbtc.com/alice",
    )
    expect(mockFetch).toHaveBeenCalledWith(
      "https://blink.sv/.well-known/lnurlp/alice",
      expect.objectContaining({ cache: "no-store" }),
    )
  })

  it("encodes the username in both the probe and the redirect target", async () => {
    mockFetch.mockResolvedValue(jsonResponse({ tag: "payRequest" }))
    await expect(migratedTerminalUrl("a/b?c d")).resolves.toBe(
      "https://terminal.blinkbtc.com/a%2Fb%3Fc%20d",
    )
    expect(mockFetch).toHaveBeenCalledWith(
      "https://blink.sv/.well-known/lnurlp/a%2Fb%3Fc%20d",
      expect.anything(),
    )
  })

  it("preserves the subpath and query string in the redirect target", async () => {
    mockFetch.mockResolvedValue(jsonResponse({ tag: "payRequest" }))
    await expect(
      migratedTerminalUrl("alice", "/print", "?amount=21&display=USD"),
    ).resolves.toBe("https://terminal.blinkbtc.com/alice/print?amount=21&display=USD")
  })

  it("returns null for a non-migrated username ({status: ERROR} body)", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ status: "ERROR", reason: "Couldn't find user" }),
    )
    await expect(migratedTerminalUrl("ghost")).resolves.toBeNull()
  })

  it("returns null when the body has no payRequest tag", async () => {
    mockFetch.mockResolvedValue(jsonResponse({ tag: "withdrawRequest" }))
    await expect(migratedTerminalUrl("alice")).resolves.toBeNull()
  })

  it("returns null on a non-OK response", async () => {
    mockFetch.mockResolvedValue(jsonResponse({}, false))
    await expect(migratedTerminalUrl("alice")).resolves.toBeNull()
  })

  it("returns null on a non-JSON response body", async () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined)
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => {
        throw new SyntaxError("Unexpected token < in JSON")
      },
    })
    await expect(migratedTerminalUrl("alice")).resolves.toBeNull()
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it("returns null when the fetch fails (timeout/network) and warns, not errors", async () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined)
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined)
    mockFetch.mockRejectedValue(new Error("The operation timed out"))
    await expect(migratedTerminalUrl("alice")).resolves.toBeNull()
    expect(warnSpy).toHaveBeenCalled()
    expect(errorSpy).not.toHaveBeenCalled()
    warnSpy.mockRestore()
    errorSpy.mockRestore()
  })
})
