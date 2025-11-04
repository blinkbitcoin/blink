type ApiKeysServiceError =
  | import("./errors").InvalidApiKeyIdError
  | import("./errors").ApiKeyLimitExceededError
  | import("./errors").ApiKeySpendingRecordError
  | import("./errors").ApiKeyInvalidLimitError
  | import("./errors").UnknownApiKeysServiceError

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
}
