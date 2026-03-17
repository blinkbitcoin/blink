type ApiKeysServiceError = import("./errors").ApiKeysServiceError

type SpendingLimits = import("./spending-limits").SpendingLimits

interface IApiKeysService {
  getSpendingLimits(args: {
    apiKeyId: string
    amountSats: number
  }): Promise<SpendingLimits | ApiKeysServiceError>

  recordSpending(args: {
    apiKeyId: string
    amountSats: number
    transactionId: string
  }): Promise<true | ApiKeysServiceError>

  reverseSpending(args: { transactionId: string }): Promise<true | ApiKeysServiceError>
}
