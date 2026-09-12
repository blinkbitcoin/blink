import { InvestmentAgreementTabConflictError } from "./errors"
import {
  formatRateTimestamp,
  formatSatsAsBtc,
  formatUsdCents,
} from "./investment-agreement-formatters"
import { InvestmentAgreementValue } from "./primitives"

const isConflictingTab = (
  tab: InvestmentAgreementTabDefinition,
  other: InvestmentAgreementTabDefinition,
): boolean => {
  const isSameLabel = tab.label === other.label
  const hasDifferentContent = tab.value !== other.value || tab.locked !== other.locked
  return isSameLabel && hasDifferentContent
}

// The provider sends the same tabs to every document, so a label must mean one value
export const investmentAgreementTabs = ({
  documents,
  terms,
  investor,
  membership,
  rateTimeZone,
}: InvestmentAgreementTabsArgs): ESignTabs | InvestmentAgreementTabConflictError => {
  const tabDefinitions = documents.flatMap(({ tabs }) => tabs)

  const conflictingTab = tabDefinitions.find((tab) =>
    tabDefinitions.some((other) => isConflictingTab(tab, other)),
  )
  if (conflictingTab) return new InvestmentAgreementTabConflictError(conflictingTab.label)

  const values: Record<InvestmentAgreementValue, string> = {
    [InvestmentAgreementValue.FullLegalName]: investor.fullLegalName,
    [InvestmentAgreementValue.CountryOfResidence]: investor.countryOfResidence,
    [InvestmentAgreementValue.Email]: investor.email,
    [InvestmentAgreementValue.PricePerUnitUsd]: formatUsdCents(
      terms.pricePerUnitUsdCents,
    ),
    [InvestmentAgreementValue.NumberOfUnits]: String(terms.units),
    [InvestmentAgreementValue.TotalSubscriptionUsd]: formatUsdCents(terms.totalUsdCents),
    [InvestmentAgreementValue.SettlementAmountBtc]: formatSatsAsBtc(terms.settlementSats),
    [InvestmentAgreementValue.PreMoneyValuationUsd]: formatUsdCents(
      terms.preMoneyValuationUsdCents,
    ),
    [InvestmentAgreementValue.BtcUsdRate]: formatUsdCents(terms.btcUsdRateCents),
    [InvestmentAgreementValue.RateTimestamp]: formatRateTimestamp({
      date: terms.quotedAt,
      timeZone: rateTimeZone,
    }),
    [InvestmentAgreementValue.SubMembershipTier]: membership.tier,
    [InvestmentAgreementValue.SubMembershipTerm]: membership.term,
  }

  return Object.fromEntries(
    tabDefinitions.map(({ label, value, locked }) => [
      label,
      { value: values[value], locked },
    ]),
  )
}
