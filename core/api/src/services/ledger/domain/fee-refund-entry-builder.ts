import { lndLedgerAccountDescriptor } from "./accounts"

import { AmountCalculator, WalletCurrency } from "@/domain/shared"

const calc = AmountCalculator()

export const FeeRefundEntryBuilder = <M extends MediciEntry>({
  entry,
  metadata,
  additionalCreditMetadata,
  additionalInternalMetadata,
  staticAccountIds,
  amountToRefund,
  btcBankFee,
}: FeeRefundEntryBuilderConfig<M>): FeeRefundEntryBuilderCredit<M> => {
  const reserve = calc.sub(amountToRefund, btcBankFee)
  const internalMetadata = { ...metadata, ...additionalInternalMetadata }

  const debitBankOwner = (): M => {
    if (btcBankFee.amount > 0n) {
      entry.debit(staticAccountIds.bankOwnerAccountId, Number(btcBankFee.amount), {
        ...internalMetadata,
        currency: btcBankFee.currency,
      })
    }

    return entry
  }

  const debitOffChain = (): FeeRefundEntryBuilderFee<M> => {
    entry.debit(lndLedgerAccountDescriptor.id, Number(reserve.amount), {
      ...internalMetadata,
      currency: reserve.currency,
    })

    return { debitBankOwner }
  }

  const creditRecipient = ({
    accountDescriptor,
  }: {
    accountDescriptor: LedgerAccountDescriptor<WalletCurrency>
  }): FeeRefundEntryBuilderDebit<M> => {
    entry.credit(accountDescriptor.id, Number(amountToRefund.amount), {
      ...metadata,
      ...additionalCreditMetadata,
      currency: amountToRefund.currency,
    })

    return { debitOffChain }
  }

  return { creditRecipient }
}
