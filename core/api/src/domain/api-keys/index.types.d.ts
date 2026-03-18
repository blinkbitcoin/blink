type ApiKeyId = string & { readonly brand: unique symbol }

type ApiKeysServiceError = import("./errors").ApiKeysServiceError

type SpendingLimits = import("./spending-limits").SpendingLimits

interface IApiKeysService {
  getSpendingLimits(args: {
    apiKeyId: ApiKeyId
    amount: BtcPaymentAmount
  }): Promise<SpendingLimits | ApiKeysServiceError>

  recordSpending(args: {
    apiKeyId: ApiKeyId
    amount: BtcPaymentAmount
    transactionId: LedgerJournalId
  }): Promise<true | ApiKeysServiceError>

  reverseSpending(args: {
    transactionId: LedgerJournalId
  }): Promise<true | ApiKeysServiceError>
}
