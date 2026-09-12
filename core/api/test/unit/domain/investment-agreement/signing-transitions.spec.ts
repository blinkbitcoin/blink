import {
  checkedInvestmentAgreementSigningTransition,
  InvestmentAgreementSigningStatus,
  InvestmentAgreementStateConflictError,
} from "@/domain/investment-agreement"

describe("checkedInvestmentAgreementSigningTransition", () => {
  const allStatuses = Object.values(InvestmentAgreementSigningStatus)

  const allowedTransitions: [
    InvestmentAgreementSigningStatus,
    InvestmentAgreementSigningStatus,
  ][] = [
    [
      InvestmentAgreementSigningStatus.SigningStarted,
      InvestmentAgreementSigningStatus.Completed,
    ],
    [
      InvestmentAgreementSigningStatus.SigningStarted,
      InvestmentAgreementSigningStatus.Declined,
    ],
    [
      InvestmentAgreementSigningStatus.SigningStarted,
      InvestmentAgreementSigningStatus.Voided,
    ],
    [
      InvestmentAgreementSigningStatus.SigningStarted,
      InvestmentAgreementSigningStatus.Expired,
    ],
  ]

  const conflictingTransitions = allStatuses
    .flatMap((from) => allStatuses.map((to) => [from, to] as const))
    .filter(([from, to]) => from !== to)
    .filter(([from, to]) => !allowedTransitions.some(([f, t]) => f === from && t === to))

  test.each(allowedTransitions)("changes %s to %s", (from, to) => {
    expect(checkedInvestmentAgreementSigningTransition({ from, to })).toEqual({
      status: to,
      changed: true,
    })
  })

  test.each(allStatuses)("keeps a repeated %s event without changes", (status) => {
    expect(
      checkedInvestmentAgreementSigningTransition({ from: status, to: status }),
    ).toEqual({ status, changed: false })
  })

  test.each(conflictingTransitions)("fails from %s to %s", (from, to) => {
    const result = checkedInvestmentAgreementSigningTransition({ from, to })
    expect(result).toBeInstanceOf(InvestmentAgreementStateConflictError)
    expect(result).toHaveProperty("message", `signing: ${from} to ${to}`)
  })

  it("covers every status pair", () => {
    expect(
      allowedTransitions.length + allStatuses.length + conflictingTransitions.length,
    ).toBe(allStatuses.length * allStatuses.length)
  })
})
