import {
  InvalidInvestmentAgreementTemplateIdsError,
  InvalidInvestmentAgreementTimeZoneError,
  InvalidInvestmentUnitsError,
  InvestmentAgreementStateConflictError,
} from "./errors"
import { InvestmentAgreementDocuments } from "./investment-agreement-documents"
import { InvestmentAgreementSigningStatus } from "./primitives"

export * from "./calculate-investment-agreement-terms"
export * from "./errors"
export * from "./investment-agreement-creation"
export * from "./investment-agreement-documents"
export * from "./investment-agreement-formatters"
export * from "./investment-agreement-signing-reuse"
export * from "./investment-agreement-statuses"
export * from "./investment-agreement-tabs"
export * from "./primitives"

const SigningStatusTransitions: Record<
  InvestmentAgreementSigningStatus,
  readonly InvestmentAgreementSigningStatus[]
> = {
  [InvestmentAgreementSigningStatus.SigningStarted]: [
    InvestmentAgreementSigningStatus.Completed,
    InvestmentAgreementSigningStatus.Declined,
    InvestmentAgreementSigningStatus.Voided,
    InvestmentAgreementSigningStatus.Expired,
  ],
  [InvestmentAgreementSigningStatus.Completed]: [],
  [InvestmentAgreementSigningStatus.Declined]: [],
  [InvestmentAgreementSigningStatus.Voided]: [],
  [InvestmentAgreementSigningStatus.Expired]: [],
}

export const checkedInvestmentAgreementSigningTransition = ({
  from,
  to,
}: {
  from: InvestmentAgreementSigningStatus
  to: InvestmentAgreementSigningStatus
}):
  | InvestmentAgreementStatusTransition<InvestmentAgreementSigningStatus>
  | InvestmentAgreementStateConflictError => {
  const isRepeatedEvent = from === to
  if (isRepeatedEvent) return { status: from, changed: false }

  const isAllowedTransition = SigningStatusTransitions[from].includes(to)
  if (!isAllowedTransition) {
    return new InvestmentAgreementStateConflictError(`signing: ${from} to ${to}`)
  }
  return { status: to, changed: true }
}

export const checkedToInvestmentUnits = ({
  units,
  minUnits,
  maxUnits,
}: {
  units: number
  minUnits: InvestmentUnits
  maxUnits: InvestmentUnits
}): InvestmentUnits | InvalidInvestmentUnitsError => {
  const isWithinRange = Number.isInteger(units) && units >= minUnits && units <= maxUnits
  if (!isWithinRange) return new InvalidInvestmentUnitsError(`${units}`)
  return units as InvestmentUnits
}

export const checkedToInvestmentAgreementTemplateIds = (
  templateIds: string,
): ESignTemplateId[] | InvalidInvestmentAgreementTemplateIdsError => {
  const ids = (templateIds || "").split(",").map((id) => id.trim())
  const hasEmptyId = ids.some((id) => !id)
  const hasOneIdPerDocument = ids.length === InvestmentAgreementDocuments.length
  if (hasEmptyId || !hasOneIdPerDocument) {
    return new InvalidInvestmentAgreementTemplateIdsError(
      `expected ${InvestmentAgreementDocuments.length} comma separated template ids: ${templateIds}`,
    )
  }
  return ids as ESignTemplateId[]
}

export const checkedToInvestmentAgreementTimeZone = (
  timeZone: string,
): InvestmentAgreementTimeZone | InvalidInvestmentAgreementTimeZoneError => {
  if (!timeZone) return new InvalidInvestmentAgreementTimeZoneError(timeZone)
  try {
    const resolvedTimeZone = new Intl.DateTimeFormat("en-US", {
      timeZone,
    }).resolvedOptions().timeZone
    return resolvedTimeZone as InvestmentAgreementTimeZone
  } catch {
    return new InvalidInvestmentAgreementTimeZoneError(timeZone)
  }
}
