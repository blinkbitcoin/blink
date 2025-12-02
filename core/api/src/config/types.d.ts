type IpConfig = {
  ipRecordingEnabled: boolean
  proxyCheckingEnabled: boolean
}

type Levels = number[]

type CronConfig = {
  rebalanceEnabled: boolean
  removeInactiveMerchantsEnabled: boolean
}

type CaptchaConfig = {
  mandatory: boolean
}

type QuizzesConfig = {
  phoneMetadataValidationSettings: PhoneMetadataValidationSettings
  ipMetadataValidationSettings: IpMetadataValidationSettings
}

type PhoneMetadataValidationSettings = {
  denyCountries: string[]
  allowCountries: string[]
}

type IpMetadataValidationSettings = {
  denyCountries: string[]
  allowCountries: string[]
  denyASNs: string[]
  allowASNs: string[]
  checkProxy: boolean
}

type AccountsConfig = {
  initialStatus: AccountStatus
  initialComment?: string
  initialWallets: WalletCurrency[]
  initialLevel: AccountLevel
  maxDeletions: number
}

type AccountsOnboardConfig = {
  phoneMetadataValidationSettings: AccountsOnboardPhoneMetadataConfig
  ipMetadataValidationSettings: AccountsOnboardIpMetadataConfig
}

type AccountsOnboardPhoneMetadataConfig = PhoneMetadataValidationSettings & {
  enabled: boolean
}

type AccountsOnboardIpMetadataConfig = IpMetadataValidationSettings & {
  enabled: boolean
}

type PayoutSpeedInfo = {
  speed: PayoutSpeed
  queueName: string
  displayName: string
  description: string
  feeStrategies: FeeStrategy[]
}

type OnchainNetworkConfig = {
  dustThreshold: Satoshis
  receive: {
    walletName: string
    feeStrategies: FeeStrategy[]
    rebalance: {
      threshold: Satoshis
      minRebalanceSize: Satoshis
      minBalance: Satoshis
      payoutQueueName: string
      destinationWalletName: string
    }
    legacy: {
      minConfirmations: ScanDepth
      scanDepth: ScanDepth
    }
  }
  send: {
    walletName: string
    payoutSpeeds: {
      fast: PayoutSpeedInfo
      medium: PayoutSpeedInfo
      slow: PayoutSpeedInfo
    }
    rebalance: {
      threshold: Satoshis
      minRebalanceSize: Satoshis
      minBalance: Satoshis
      payoutQueueName: string
      destinationWalletName: string
    }
  }
}

type LightningNetworkConfig = {
  channels: {
    scanDepthChannelUpdate: ScanDepth
    backupBucketName: string
  }
  receive: {
    feeStrategies: FeeStrategy[]
    addressDomain: string
    addressDomainAliases: string[]
  }
  send: {
    feeStrategies: FeeStrategy[]
    skipFeeProbe: {
      pubkeys: Pubkey[]
      chanIds: ChanId[]
    }
  }
}

type IntraledgerNetworkConfig = {
  receive: {
    feeStrategies: FeeStrategy[]
  }
  send: {
    feeStrategies: FeeStrategy[]
  }
}
