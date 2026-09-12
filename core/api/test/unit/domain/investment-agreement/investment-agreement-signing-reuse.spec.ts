import { investmentAgreementSigningReuseUntil } from "@/domain/investment-agreement"
import { toMinutes } from "@/domain/primitives"

describe("investmentAgreementSigningReuseUntil", () => {
  it.each([
    ["2026-09-11T12:00:00Z", 15, "2026-09-11T12:15:00.000Z"],
    ["2026-09-11T11:50:00Z", 15, "2026-09-11T12:05:00.000Z"],
    ["2026-09-11T23:59:00Z", 1, "2026-09-12T00:00:00.000Z"],
  ])(
    "reuses a signing created at %s for %d minutes until %s",
    (createdAt, minutes, until) => {
      expect(
        investmentAgreementSigningReuseUntil({
          createdAt: new Date(createdAt),
          signingReuseWindowMinutes: toMinutes(minutes),
        }).toISOString(),
      ).toEqual(until)
    },
  )
})
