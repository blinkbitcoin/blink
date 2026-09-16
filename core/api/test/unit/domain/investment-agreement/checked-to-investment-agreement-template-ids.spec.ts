import {
  checkedToInvestmentAgreementTemplateIds,
  InvalidInvestmentAgreementTemplateIdsError,
} from "@/domain/investment-agreement"

describe("checkedToInvestmentAgreementTemplateIds", () => {
  it("returns one template id per document in signing order", () => {
    expect(
      checkedToInvestmentAgreementTemplateIds("membership-id,subscription-id,joinder-id"),
    ).toEqual(["membership-id", "subscription-id", "joinder-id"])
  })

  it("trims whitespace around each template id", () => {
    expect(
      checkedToInvestmentAgreementTemplateIds(
        " membership-id , subscription-id ,joinder-id ",
      ),
    ).toEqual(["membership-id", "subscription-id", "joinder-id"])
  })

  it.each([
    ["fewer template ids than documents", "membership-id,subscription-id"],
    ["more template ids than documents", "a-id,b-id,c-id,d-id"],
    ["an empty template id between commas", "membership-id,,joinder-id"],
    ["an empty value", ""],
    ["an undefined value", undefined as unknown as string],
  ])("fails for %s", (_, templateIds) => {
    expect(checkedToInvestmentAgreementTemplateIds(templateIds)).toBeInstanceOf(
      InvalidInvestmentAgreementTemplateIdsError,
    )
  })
})
