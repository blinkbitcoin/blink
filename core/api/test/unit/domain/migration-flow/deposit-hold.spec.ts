import { toSats } from "@/domain/bitcoin"
import { evaluateDepositHold, MigrationOnHoldError } from "@/domain/migration-flow"

describe("evaluateDepositHold", () => {
  it("passes when the volume is under the threshold", () => {
    const result = evaluateDepositHold({
      volumeSats: toSats(999),
      thresholdSats: toSats(1000),
    })
    expect(result).toBe(true)
  })

  it("passes when the volume equals the threshold", () => {
    const result = evaluateDepositHold({
      volumeSats: toSats(1000),
      thresholdSats: toSats(1000),
    })
    expect(result).toBe(true)
  })

  it("holds when the volume exceeds the threshold", () => {
    const result = evaluateDepositHold({
      volumeSats: toSats(1001),
      thresholdSats: toSats(1000),
    })
    expect(result).toBeInstanceOf(MigrationOnHoldError)
  })

  it("passes a zero volume against a zero threshold", () => {
    const result = evaluateDepositHold({
      volumeSats: toSats(0),
      thresholdSats: toSats(0),
    })
    expect(result).toBe(true)
  })
})
