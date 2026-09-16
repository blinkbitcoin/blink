import { getInvestmentAgreementConfig, INVESTMENT_AGREEMENT_ENABLED } from "@/config"

import { getCurrentSatPrice } from "@/app/prices"

import { AccountValidator } from "@/domain/accounts"
import { CouldNotFindInvestmentAgreementError } from "@/domain/errors"
import { ESignRecipientStatusNotSupportedError } from "@/domain/esign"
import { UsdDisplayCurrency } from "@/domain/fiat"
import {
  calculateInvestmentAgreementTerms,
  checkedToInvestmentUnits,
  InvestmentAgreementApiKeyForbiddenError,
  InvestmentAgreementCreationAction,
  investmentAgreementCreationAction,
  InvestmentAgreementDisabledError,
  InvestmentAgreementDocuments,
  InvestmentAgreementEmailRequiredError,
  InvestmentAgreementInProgressError,
  investmentAgreementSigningReuseUntil,
  investmentAgreementTabs,
  supersededInvestmentAgreementSigningStatus,
} from "@/domain/investment-agreement"
import { toHours, toMinutes } from "@/domain/primitives"
import { ErrorLevel } from "@/domain/shared"

import { ESignService } from "@/services/esign"
import { IdentityRepository } from "@/services/kratos"
import { LockService } from "@/services/lock"
import { AccountsRepository, InvestmentAgreementsRepository } from "@/services/mongoose"
import { recordExceptionInCurrentSpan } from "@/services/tracing"

type InvestmentAgreementSigningArgs = {
  accountId: AccountId
  units: InvestmentUnits
  recipient: ESignRecipient
  esignService: IESignService
  config: InvestmentAgreementConfig
}

export const createInvestmentAgreement = async ({
  accountId,
  units: unitsRaw,
  apiKeyId,
}: {
  accountId: AccountId
  units: number
  apiKeyId?: ApiKeyId
}): Promise<InvestmentAgreementSigningSession | ApplicationError> => {
  if (apiKeyId) return new InvestmentAgreementApiKeyForbiddenError()

  if (!INVESTMENT_AGREEMENT_ENABLED) return new InvestmentAgreementDisabledError()

  const config = getInvestmentAgreementConfig()

  const units = checkedToInvestmentUnits({
    units: unitsRaw,
    minUnits: config.minUnits,
    maxUnits: config.maxUnits,
  })
  if (units instanceof Error) return units

  const account = await AccountsRepository().findById(accountId)
  if (account instanceof Error) return account

  const accountValidator = AccountValidator(account)
  if (accountValidator instanceof Error) return accountValidator

  const identity = await IdentityRepository().getIdentity(account.kratosUserId)
  if (identity instanceof Error) return identity

  const { email } = identity
  if (!email) return new InvestmentAgreementEmailRequiredError()

  const esignService = ESignService()
  if (esignService instanceof Error) return esignService

  const recipient = { name: config.placeholderValues.fullLegalName, email }

  return LockService().lockInvestmentAgreementCreation(accountId, () =>
    lockedCreateInvestmentAgreement({
      accountId,
      units,
      recipient,
      esignService,
      config,
    }),
  )
}

const lockedCreateInvestmentAgreement = async (
  signingArgs: InvestmentAgreementSigningArgs,
): Promise<InvestmentAgreementSigningSession | ApplicationError> => {
  const { accountId, units, recipient, esignService } = signingArgs

  const latestAgreement =
    await InvestmentAgreementsRepository().findLatestByAccountId(accountId)
  if (latestAgreement instanceof CouldNotFindInvestmentAgreementError) {
    return startInvestmentAgreement(signingArgs)
  }
  if (latestAgreement instanceof Error) return latestAgreement

  const action = investmentAgreementCreationAction({
    latestAgreement,
    units,
    now: new Date(),
  })
  if (action instanceof Error) return action

  if (action === InvestmentAgreementCreationAction.ReuseSigning) {
    return reuseInvestmentAgreementSigning({
      agreement: latestAgreement,
      recipient,
      esignService,
    })
  }

  if (action === InvestmentAgreementCreationAction.CheckInvestorSignature) {
    const superseded = await supersedeInvestmentAgreement({
      agreement: latestAgreement,
      esignService,
    })
    if (superseded instanceof Error) return superseded
  }

  return startInvestmentAgreement(signingArgs)
}

const reuseInvestmentAgreementSigning = async ({
  agreement,
  recipient,
  esignService,
}: {
  agreement: InvestmentAgreement
  recipient: ESignRecipient
  esignService: IESignService
}): Promise<InvestmentAgreementSigningSession | ApplicationError> => {
  const signingUrl = await esignService.getSigningUrl({
    envelopeId: agreement.envelopeId,
    recipient,
  })
  if (signingUrl instanceof Error) return signingUrl

  return { agreement, signingUrl }
}

// the reuse window alone never expires an agreement: the investor signature decides
const supersedeInvestmentAgreement = async ({
  agreement,
  esignService,
}: {
  agreement: InvestmentAgreement
  esignService: IESignService
}): Promise<InvestmentAgreement | ApplicationError> => {
  const investorStatus = await esignService.getRecipientStatus({
    envelopeId: agreement.envelopeId,
  })
  if (investorStatus instanceof ESignRecipientStatusNotSupportedError) {
    return new InvestmentAgreementInProgressError("unknown investor signature status")
  }
  if (investorStatus instanceof Error) return investorStatus

  const signingStatus = supersededInvestmentAgreementSigningStatus(investorStatus)
  if (signingStatus instanceof Error) return signingStatus

  return InvestmentAgreementsRepository().updateSigningStatus({
    id: agreement.id,
    from: agreement.signingStatus,
    to: signingStatus,
  })
}

const startInvestmentAgreement = async ({
  accountId,
  units,
  recipient,
  esignService,
  config,
}: InvestmentAgreementSigningArgs): Promise<
  InvestmentAgreementSigningSession | ApplicationError
> => {
  const btcPrice = await getCurrentSatPrice({ currency: UsdDisplayCurrency })
  if (btcPrice instanceof Error) return btcPrice

  const terms = calculateInvestmentAgreementTerms({
    units,
    pricePerUnitUsdCents: config.pricePerUnitUsdCents,
    preMoneyValuationUsdCents: config.preMoneyValuationUsdCents,
    btcPrice,
  })
  if (terms instanceof Error) return terms

  const tabs = investmentAgreementTabs({
    documents: InvestmentAgreementDocuments,
    terms,
    investor: {
      email: recipient.email,
      fullLegalName: config.placeholderValues.fullLegalName,
      countryOfResidence: config.placeholderValues.countryOfResidence,
    },
    membership: {
      tier: config.placeholderValues.subMembershipTier,
      term: config.placeholderValues.subMembershipTerm,
    },
    rateTimeZone: config.rateTimeZone,
  })
  if (tabs instanceof Error) return tabs

  const envelope = await esignService.createEnvelope({ accountId, recipient, tabs })
  if (envelope instanceof Error) return envelope

  const createdAt = new Date()
  const agreement = await InvestmentAgreementsRepository().persistNew({
    accountId,
    envelopeId: envelope.envelopeId,
    terms,
    signingReuseUntil: investmentAgreementSigningReuseUntil({
      createdAt,
      signingReuseWindowMinutes: toMinutes(config.signingReuseWindowMinutes),
    }),
    paymentWindowHours: toHours(config.paymentWindowHours),
    createdAt,
  })
  if (agreement instanceof Error) {
    recordExceptionInCurrentSpan({
      error: agreement,
      level: ErrorLevel.Critical,
      attributes: { "investmentAgreement.envelopeId": envelope.envelopeId },
    })
    return agreement
  }

  return { agreement, signingUrl: envelope.signingUrl }
}
