import { InvestmentAgreement } from "./schema"
import { parseRepositoryError } from "./utils"

import { CouldNotFindInvestmentAgreementError } from "@/domain/errors"
import {
  checkedInvestmentAgreementSigningTransition,
  InvestmentAgreementPaymentStatus,
  InvestmentAgreementSigningStatus,
  InvestmentAgreementStateConflictError,
} from "@/domain/investment-agreement"

export const InvestmentAgreementsRepository = (): IInvestmentAgreementsRepository => {
  const persistNew = async ({
    accountId,
    envelopeId,
    terms,
    signingReuseUntil,
    paymentWindowHours,
    createdAt,
  }: PersistNewInvestmentAgreementArgs): Promise<
    InvestmentAgreement | RepositoryError
  > => {
    try {
      const result = await InvestmentAgreement.create({
        accountId,
        envelopeId,
        signingStatus: InvestmentAgreementSigningStatus.SigningStarted,
        paymentStatus: InvestmentAgreementPaymentStatus.Unpaid,
        units: terms.units,
        pricePerUnitUsdCents: terms.pricePerUnitUsdCents,
        totalUsdCents: terms.totalUsdCents,
        preMoneyValuationUsdCents: terms.preMoneyValuationUsdCents,
        btcUsdRateCents: terms.btcUsdRateCents,
        settlementSats: terms.settlementSats,
        quotedAt: terms.quotedAt,
        signingReuseUntil,
        paymentWindowHours,
        signingSteps: [
          {
            status: InvestmentAgreementSigningStatus.SigningStarted,
            recordedAt: createdAt,
          },
        ],
        paymentSteps: [
          { status: InvestmentAgreementPaymentStatus.Unpaid, recordedAt: createdAt },
        ],
        createdAt,
        updatedAt: createdAt,
      })
      return investmentAgreementFromRaw(result)
    } catch (err) {
      return parseRepositoryError(err)
    }
  }

  const findById = async (
    id: InvestmentAgreementId,
  ): Promise<InvestmentAgreement | RepositoryError> => {
    try {
      const result = await InvestmentAgreement.findOne({ id })
      if (!result) return new CouldNotFindInvestmentAgreementError(id)
      return investmentAgreementFromRaw(result)
    } catch (err) {
      return parseRepositoryError(err)
    }
  }

  const findLatestByAccountId = async (
    accountId: AccountId,
  ): Promise<InvestmentAgreement | RepositoryError> => {
    try {
      const result = await InvestmentAgreement.findOne({ accountId }).sort({
        createdAt: -1,
      })
      if (!result) return new CouldNotFindInvestmentAgreementError(accountId)
      return investmentAgreementFromRaw(result)
    } catch (err) {
      return parseRepositoryError(err)
    }
  }

  const updateSigningStatus = async ({
    id,
    from,
    to,
  }: UpdateInvestmentAgreementSigningStatusArgs): Promise<
    InvestmentAgreement | InvestmentAgreementStateConflictError | RepositoryError
  > => {
    const transition = checkedInvestmentAgreementSigningTransition({ from, to })
    if (transition instanceof Error) return transition
    if (!transition.changed) return findById(id)

    try {
      const recordedAt = new Date()
      const result = await InvestmentAgreement.findOneAndUpdate(
        { id, signingStatus: from },
        {
          $set: { signingStatus: transition.status, updatedAt: recordedAt },
          $push: { signingSteps: { status: transition.status, recordedAt } },
        },
        { new: true },
      )
      if (!result) {
        return new InvestmentAgreementStateConflictError(`signing: ${from} to ${to}`)
      }
      return investmentAgreementFromRaw(result)
    } catch (err) {
      return parseRepositoryError(err)
    }
  }

  return {
    persistNew,
    findById,
    findLatestByAccountId,
    updateSigningStatus,
  }
}

const investmentAgreementFromRaw = (
  result: InvestmentAgreementRecord,
): InvestmentAgreement => ({
  id: result.id as InvestmentAgreementId,
  accountId: result.accountId as AccountId,
  envelopeId: result.envelopeId as ESignEnvelopeId,
  signingStatus: result.signingStatus as InvestmentAgreementSigningStatus,
  paymentStatus: result.paymentStatus as InvestmentAgreementPaymentStatus,
  terms: {
    units: result.units as InvestmentUnits,
    pricePerUnitUsdCents: result.pricePerUnitUsdCents as UsdCents,
    totalUsdCents: result.totalUsdCents as UsdCents,
    preMoneyValuationUsdCents: result.preMoneyValuationUsdCents as UsdCents,
    btcUsdRateCents: result.btcUsdRateCents as UsdCentsPerBtc,
    settlementSats: result.settlementSats as Satoshis,
    quotedAt: result.quotedAt,
  },
  signingReuseUntil: result.signingReuseUntil,
  paymentWindowHours: result.paymentWindowHours as Hours,
  paymentDeadline: result.paymentDeadline || undefined,
  signingSteps: (result.signingSteps || []).map(({ status, recordedAt }) => ({
    status: status as InvestmentAgreementSigningStatus,
    recordedAt,
  })),
  paymentSteps: (result.paymentSteps || []).map(({ status, recordedAt }) => ({
    status: status as InvestmentAgreementPaymentStatus,
    recordedAt,
  })),
  createdAt: result.createdAt,
  updatedAt: result.updatedAt,
})
