import {
  SettlementViaType,
  TransactionEvent,
  TransactionType,
} from "./proto/transactions_pb"

import {
  TransactionsStreamSettlementVia,
  TransactionsStreamTransactionType,
} from "@/domain/transactions-stream"

const transactionStreamTransactionTypeToGrpcTransactionType = (
  transactionType: TransactionsStreamTransactionType,
): TransactionType => {
  switch (transactionType) {
    case TransactionsStreamTransactionType.Sent:
      return TransactionType.SENT
    case TransactionsStreamTransactionType.Received:
      return TransactionType.RECEIVED
  }
}

const transactionStreamSettlementViaToGrpcSettlementVia = (
  settlementVia: TransactionsStreamSettlementVia,
): SettlementViaType => {
  switch (settlementVia) {
    case TransactionsStreamSettlementVia.Lightning:
      return SettlementViaType.LIGHTNING
    case TransactionsStreamSettlementVia.Intraledger:
      return SettlementViaType.INTRA_LEDGER
    case TransactionsStreamSettlementVia.Onchain:
      return SettlementViaType.ONCHAIN
    case TransactionsStreamSettlementVia.Unspecified:
      return SettlementViaType.SETTLEMENT_VIA_UNSPECIFIED
  }
}

export const transactionStreamEventToGrpcTransactionEvent = (
  event: TransactionStreamEvent,
): TransactionEvent => {
  const grpcEvent = new TransactionEvent()

  grpcEvent.setLedgerTransactionId(event.ledgerTransactionId)
  grpcEvent.setWalletId(event.walletId)
  grpcEvent.setAccountId(event.accountId ?? "")
  grpcEvent.setPaymentHash(event.paymentHash ?? "")
  grpcEvent.setPreimage(event.preimage ?? "")
  grpcEvent.setSatsAmount(event.satsAmount)
  grpcEvent.setCentsAmount(event.centsAmount)
  grpcEvent.setCurrency(event.currency)
  grpcEvent.setType(transactionStreamTransactionTypeToGrpcTransactionType(event.type))
  grpcEvent.setSettlementVia(
    transactionStreamSettlementViaToGrpcSettlementVia(event.settlementVia),
  )
  grpcEvent.setPending(event.pending)
  grpcEvent.setTimestamp(
    event.timestamp ? Math.floor(event.timestamp.getTime() / 1000) : 0,
  )

  return grpcEvent
}
