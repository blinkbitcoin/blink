import { visibleStepDetail } from "@/graphql/admin/types/object/migration-flow-step"

describe("visibleStepDetail", () => {
  const stepWith = (step: string, detail?: string) =>
    ({ step, detail, recordedAt: new Date() }) as MigrationFlowStep

  it.each([
    ["commit", "paymentHash: abc123"],
    ["transfer-pending", "paymentHash: abc123"],
    ["transfer-failed", "RouteNotFoundError"],
    ["retry-granted", "admin: client-id"],
  ])("exposes the detail of %s", (step, detail) => {
    expect(visibleStepDetail(stepWith(step, detail))).toBe(detail)
  })

  it.each([
    [
      "drain-computed",
      "amount: 200000 sats, reserve: 2000 sats, expected residual: 0 sats",
    ],
    ["reserve-top-up", "10 sats from bank owner; Blink covered the Spark network fee"],
    ["residual-top-up", "1 sats from bank owner; makes the drain land on zero"],
    ["top-up-reclaimed", "10 sats returned to bank owner"],
    ["top-up-reclaim-failed", "10 sats could not be reclaimed"],
    ["transfer-skipped", "zero balance"],
    ["transfer-settled", "residual balance: 9 sats"],
  ])("redacts the amount-bearing detail of %s", (step, detail) => {
    expect(visibleStepDetail(stepWith(step, detail))).toBeNull()
  })

  it.each([
    "balance lookup failed: UnknownLedgerError",
    "top-up failed: IntraledgerLimitsExceededError",
    "drain amount failed: InvalidBtcPaymentAmountError",
    "residual top-up failed: IntraledgerLimitsExceededError",
    "ln payment failed: RouteNotFoundError",
    "invoice already paid",
    "ln payment failed",
  ])("exposes the transfer-failed reason %s", (detail) => {
    expect(visibleStepDetail(stepWith("transfer-failed", detail))).toBe(detail)
  })

  it.each([
    ["transfer-failed", "negative balance: -5 sats"],
    ["commit", "paymentHash: abc123 (200000 sats)"],
    ["retry-granted", "admin: client-id, 1234 sats stranded"],
  ])("redacts a cleared step whose detail quotes an amount: %s", (step, detail) => {
    expect(visibleStepDetail(stepWith(step, detail))).toBeNull()
  })

  it("keeps hex payment hashes, which are digits but not amounts", () => {
    const detail = "paymentHash: 4030d57b070ce1cab03fd975a555d5bd"
    expect(visibleStepDetail(stepWith("commit", detail))).toBe(detail)
  })

  it("redacts a step it has never seen, rather than exposing it", () => {
    expect(visibleStepDetail(stepWith("some-future-step", "1234 sats moved"))).toBeNull()
  })

  it("returns null when a visible step carries no detail", () => {
    expect(visibleStepDetail(stepWith("transfer-settled"))).toBeNull()
  })
})
