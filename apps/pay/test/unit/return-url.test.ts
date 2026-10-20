import { safeReturnUrl } from "@/lib/return-url"

// Cypress (Chai) types shadow jest's global `expect` in this tsconfig program.
const expect = globalThis.expect as unknown as jest.Expect

describe("safeReturnUrl", () => {
  it("accepts absolute https URLs and normalizes them", () => {
    expect(safeReturnUrl("https://shop.example.com/order/42?key=abc")).toBe(
      "https://shop.example.com/order/42?key=abc",
    )
    expect(safeReturnUrl("https://shop.example.com")).toBe("https://shop.example.com/")
    expect(safeReturnUrl("HTTPS://Shop.Example.com/x")).toBe("https://shop.example.com/x")
  })

  it("returns null for empty values", () => {
    expect(safeReturnUrl(null)).toBeNull()
    expect(safeReturnUrl(undefined)).toBeNull()
    expect(safeReturnUrl("")).toBeNull()
  })

  it("rejects non-https schemes", () => {
    expect(safeReturnUrl("http://shop.example.com/")).toBeNull()
    expect(safeReturnUrl("javascript:void(0)")).toBeNull()
    expect(safeReturnUrl("JavaScript:void(0)")).toBeNull()
    expect(safeReturnUrl("  javascript:void(0)")).toBeNull()
    expect(safeReturnUrl("java\tscript:void(0)")).toBeNull()
    expect(safeReturnUrl("data:text/html,hello")).toBeNull()
    expect(safeReturnUrl("about:client")).toBeNull()
  })

  it("rejects relative, protocol-relative and malformed values", () => {
    expect(safeReturnUrl("/checkout/abc")).toBeNull()
    expect(safeReturnUrl("//shop.example.com/")).toBeNull()
    expect(safeReturnUrl("shop.example.com")).toBeNull()
    expect(safeReturnUrl("https://")).toBeNull()
  })

  it("rejects URLs with embedded credentials", () => {
    expect(safeReturnUrl("https://pay.example.com@shop.example.com/")).toBeNull()
    expect(safeReturnUrl("https://user:pass@shop.example.com/")).toBeNull()
  })

  it("returns values that are safe to use as header values", () => {
    const withNewline = safeReturnUrl("https://shop.example.com/a\r\nb")
    expect(withNewline).not.toBeNull()
    expect(withNewline).not.toMatch(/[\r\n]/)

    const nonAscii = safeReturnUrl("https://shop.example.com/café")
    expect(nonAscii).toBe("https://shop.example.com/caf%C3%A9")
    expect(() => new Headers({ "x-return-url": nonAscii as string })).not.toThrow()
  })
})
