type BuildNumberInput = {
  minBuildNumber: number
  lastBuildNumber: number
}

type RateLimitInput = {
  points: number
  duration: number
  blockDuration: number
}

type AccountLimitsConfig = {
  level: {
    1: number
    2: number
    3: number
  }
}

type FlatFeeStrategyParams = {
  amount: number
}

type PercentageFeeStrategyParams = {
  basisPoints: number
}

type TieredFlatFeeStrategyParams = {
  tiers: Array<{
    maxAmount: number | null
    amount: number
  }>
}

type ExemptAccountFeeStrategyParams = {
  roles: string[]
  accountIds: string[]
  exemptValidatedMerchants: boolean
}

type ImbalanceFeeStrategyParams = {
  threshold: number
  ratioAsBasisPoints: number
  daysLookback: Days
  minFee: number
}

type FeeStrategy =
  | { name: string; strategy: "flat"; params: FlatFeeStrategyParams }
  | { name: string; strategy: "percentage"; params: PercentageFeeStrategyParams }
  | { name: string; strategy: "tieredFlat"; params: TieredFlatFeeStrategyParams }
  | { name: string; strategy: "exemptAccount"; params: ExemptAccountFeeStrategyParams }
  | { name: string; strategy: "imbalance"; params: ImbalanceFeeStrategyParams }

type PayoutSpeedInput = {
  queueName: string
  displayName: string
  description: string
  feeStrategies: string[]
}

type PaymentNetworkRebalanceInput = {
  threshold: number
  minRebalanceSize: number
  minBalance: number
  payoutQueueName: string
  destinationWalletName: string
}

type OnchainLegacyInput = {
  minConfirmations: number
  scanDepth: number
}

type OnchainReceiveInput = {
  walletName: string
  feeStrategies: string[]
  rebalance: PaymentNetworkRebalanceInput
  legacy: OnchainLegacyInput
}

type OnchainSendInput = {
  walletName: string
  payoutSpeeds: {
    fast: PayoutSpeedInput
    medium: PayoutSpeedInput
    slow: PayoutSpeedInput
  }
  rebalance: PaymentNetworkRebalanceInput
}

type OnchainNetworkInput = {
  dustThreshold: number
  receive: OnchainReceiveInput
  send: OnchainSendInput
}

type LightningChannelsInput = {
  scanDepthChannelUpdate: number
  backupBucketName: string
}

type LightningReceiveInput = {
  feeStrategies: string[]
  addressDomain: string
  addressDomainAliases: string[]
}

type SkipFeeProbeInput = {
  pubkeys: string[]
  chanIds: string[]
}

type LightningSendInput = {
  feeStrategies: string[]
  skipFeeProbe: SkipFeeProbeInput
}

type LightningNetworkInput = {
  channels: LightningChannelsInput
  receive: LightningReceiveInput
  send: LightningSendInput
}

type IntraledgerDirectionInput = {
  feeStrategies: string[]
}

type IntraledgerNetworkInput = {
  receive: IntraledgerDirectionInput
  send: IntraledgerDirectionInput
}

type PaymentNetworksInput = {
  onchain: OnchainNetworkInput
  lightning: LightningNetworkInput
  intraledger: IntraledgerNetworkInput
}

type YamlSchema = {
  name: string
  locale: string
  displayCurrency: {
    symbol: string
    code: string
  }
  funder: string
  dealer: {
    usd: {
      hedgingEnabled: boolean
    }
  }
  ratioPrecision: number
  buildVersion: {
    android: BuildNumberInput
    ios: BuildNumberInput
  }
  quizzes: {
    enableIpProxyCheck: boolean
    denyPhoneCountries: string[]
    allowPhoneCountries: string[]
    denyIPCountries: string[]
    allowIPCountries: string[]
    denyASNs: string[]
    allowASNs: string[]
  }
  admin_accounts: {
    role: string
    phone: string
  }[]
  test_accounts: {
    phone: string
    code: string
  }[]
  rateLimits: {
    requestCodePerEmail: RateLimitInput
    requestCodePerPhoneNumber: RateLimitInput
    requestCodePerIp: RateLimitInput
    requestTelegramPassportNoncePerPhoneNumber: RateLimitInput
    requestTelegramPassportNoncePerIp: RateLimitInput
    loginAttemptPerLoginIdentifier: RateLimitInput
    failedLoginAttemptPerIp: RateLimitInput
    invoiceCreateAttempt: RateLimitInput
    invoiceCreateForRecipientAttempt: RateLimitInput
    onChainAddressCreateAttempt: RateLimitInput
    deviceAccountCreateAttempt: RateLimitInput
    requestCodePerAppcheckJti: RateLimitInput
    addQuizPerIp: RateLimitInput
    addQuizPerPhone: RateLimitInput
  }
  accounts: {
    initialStatus: string
    initialWallets: WalletCurrency[]
    enablePhoneCheck: boolean
    enableIpCheck: boolean
    enableIpProxyCheck: boolean
    denyPhoneCountries: string[]
    allowPhoneCountries: string[]
    denyIPCountries: string[]
    allowIPCountries: string[]
    denyASNs: string[]
    allowASNs: string[]
    maxDeletions: number
  }
  accountLimits: {
    withdrawal: AccountLimitsConfig
    intraLedger: AccountLimitsConfig
    tradeIntraAccount: AccountLimitsConfig
  }
  spamLimits: {
    memoSharingSatsThreshold: number
    memoSharingCentsThreshold: number
  }
  ipRecording: {
    enabled: boolean
    proxyChecking: {
      enabled: boolean
    }
  }
  feeStrategies: FeeStrategy[]
  paymentNetworks: PaymentNetworksInput
  userActivenessMonthlyVolumeThreshold: number
  cronConfig: {
    rebalanceEnabled: boolean
    removeInactiveMerchantsEnabled: boolean
  }
  captcha: {
    mandatory: boolean
  }
  smsAuthUnsupportedCountries: string[]
  whatsAppAuthUnsupportedCountries: string[]
  telegramAuthUnsupportedCountries: string[]
  phoneProvider: {
    verify: "prelude" | "twilio"
    transactional: "prelude" | "twilio"
  }
}
