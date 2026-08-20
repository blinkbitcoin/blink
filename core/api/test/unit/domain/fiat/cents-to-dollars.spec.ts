import { centsToDollars } from "@/domain/fiat"

describe("centsToDollars", () => {
  it("converts whole-dollar cent amounts", () => {
    expect(centsToDollars(1000)).toBe(10)
    expect(centsToDollars(100)).toBe(1)
  })

  it("converts sub-dollar cent amounts", () => {
    expect(centsToDollars(13)).toBe(0.13)
    expect(centsToDollars(1)).toBe(0.01)
  })

  it("returns 0 for a zero amount", () => {
    expect(centsToDollars(0)).toBe(0)
  })

  it("returns a plain number without fixed-decimal padding", () => {
    expect(centsToDollars(10)).toBe(0.1)
    expect(centsToDollars(50)).toBe(0.5)
  })

  it("handles large amounts", () => {
    expect(centsToDollars(100000001)).toBe(1000000.01)
  })
})
