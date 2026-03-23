type ApiKeyId = string & { readonly brand: unique symbol }

type EphemeralId = string & { readonly brand: unique symbol }

type ApiKeysServiceError = import("./errors").ApiKeysServiceError

interface IApiKeysService {
  checkAndLockSpending(args: {
    apiKeyId: ApiKeyId
    amount: BtcPaymentAmount
  }): Promise<EphemeralId | ApiKeysServiceError>

  recordSpending(args: {
    apiKeyId: ApiKeyId
    amount: BtcPaymentAmount
    transactionId: LedgerJournalId
    ephemeralId: EphemeralId
  }): Promise<true | ApiKeysServiceError>

  reverseSpending(args: { transactionId: string }): Promise<true | ApiKeysServiceError>
}
