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

type PayoutQueueConfig = {
  speed: PayoutSpeed
  queueName: string
  displayName: string
  description: string
}

type RebalanceConfig = {
  threshold: Satoshis
  minRebalanceSize: Satoshis
  minBalance: Satoshis
  payoutQueueName: string
}

type YamlSchema = {
  name: string
  lightningAddressDomain: string
  lightningAddressDomainAliases: string[]
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
  bria: {
    receiveWalletName: string
    withdrawalWalletName: string
    payoutQueues: PayoutQueueConfig[]
    coldWalletName: string
    rebalances: {
      hotToCold: RebalanceConfig
      receiveToWithdrawal: RebalanceConfig
    }
  }
  lndScbBackupBucketName: string
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
  fees: {
    deposit: {
      defaultMin: number
      threshold: number
      ratioAsBasisPoints: number
    }
    merchantDeposit: {
      defaultMin: number
      threshold: number
      ratioAsBasisPoints: number
    }
    withdraw: {
      method: string
      ratioAsBasisPoints: number
      threshold: number
      daysLookback: number
      defaultMin: number
    }
  }
  onChainWallet: {
    dustThreshold: number
    minConfirmations: number
    scanDepth: number
    scanDepthOutgoing: number
    scanDepthChannelUpdate: number
  }
  userActivenessMonthlyVolumeThreshold: number
  cronConfig: {
    rebalanceEnabled: boolean
    removeInactiveMerchantsEnabled: boolean
  }
  captcha: {
    mandatory: boolean
  }
  skipFeeProbeConfig: { pubkey: string[]; chanId: string[] }
  smsAuthUnsupportedCountries: string[]
  whatsAppAuthUnsupportedCountries: string[]
  telegramAuthUnsupportedCountries: string[]
}
