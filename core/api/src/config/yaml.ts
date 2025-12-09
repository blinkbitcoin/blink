import fs from "fs"

import path from "path"

import Ajv from "ajv"
import * as yaml from "js-yaml"

import mergeWith from "lodash.mergewith"

import { configSchema } from "./schema"

import { ConfigError } from "./error"

import { baseLogger } from "@/services/logger"
import { checkedToScanDepth } from "@/domain/bitcoin/onchain"
import { toCents } from "@/domain/fiat"

import { toSeconds } from "@/domain/primitives"

import { AccountLevel } from "@/domain/accounts"

const merge = (defaultConfig: unknown, customConfig: unknown) =>
  mergeWith(defaultConfig, customConfig, (a, b) => (Array.isArray(b) ? b : undefined))

let customContent: string, customConfig

const DEFAULT_CONFIG_PATH = "/var/yaml/custom.yaml"
const providedPath = process.argv[2]
const configPath = providedPath ? path.resolve(providedPath) : DEFAULT_CONFIG_PATH

try {
  customContent = fs.readFileSync(configPath, "utf8")
  customConfig = yaml.load(customContent)
  baseLogger.info("loading custom.yaml")
} catch (err) {
  baseLogger.debug({ err }, "no custom.yaml available. using default values")
}

// TODO: fix errors
// const ajv = new Ajv({ allErrors: true, strict: "log" })
const ajv = new Ajv({ useDefaults: true, discriminator: true, $data: true })

const defaultConfig = {}
const validate = ajv.compile<YamlSchema>(configSchema)

// validate is mutating defaultConfig - even thought it's a const -> it's changing its properties
validate(defaultConfig)

export const yamlConfigInit = merge(defaultConfig, customConfig)

const valid = validate(yamlConfigInit)

if (!valid) {
  baseLogger.error({ validationErrors: validate.errors }, "Invalid yaml configuration")
  throw new ConfigError("Invalid yaml configuration", validate.errors)
}
export const yamlConfig = yamlConfigInit as YamlSchema

export const RATIO_PRECISION: number = yamlConfig.ratioPrecision

export const MEMO_SHARING_SATS_THRESHOLD = yamlConfig.spamLimits
  .memoSharingSatsThreshold as Satoshis
export const MEMO_SHARING_CENTS_THRESHOLD = yamlConfig.spamLimits
  .memoSharingCentsThreshold as UsdCents

export const MAX_PAGINATION_PAGE_SIZE = 100

// how many block are we looking back for getChainTransactions
const getOnChainScanDepth = (val: number): ScanDepth => {
  const scanDepth = checkedToScanDepth(val)
  if (scanDepth instanceof Error) throw scanDepth
  return scanDepth
}

export const ONCHAIN_MIN_CONFIRMATIONS = getOnChainScanDepth(
  yamlConfig.paymentNetworks.onchain.receive.legacy.minConfirmations,
)

export const ONCHAIN_SCAN_DEPTH = getOnChainScanDepth(
  yamlConfig.paymentNetworks.onchain.receive.legacy.scanDepth,
)

export const ONCHAIN_SCAN_DEPTH_CHANNEL_UPDATE = getOnChainScanDepth(
  yamlConfig.paymentNetworks.lightning.channels.scanDepthChannelUpdate,
)

export const USER_ACTIVENESS_MONTHLY_VOLUME_THRESHOLD = toCents(
  yamlConfig.userActivenessMonthlyVolumeThreshold,
)

export const getBriaPartialConfigFromYaml = () => {
  const { onchain } = yamlConfig.paymentNetworks
  return {
    receiveWalletName: onchain.receive.walletName,
    withdrawalWalletName: onchain.send.walletName,
    coldWalletName: onchain.send.rebalance.destinationWalletName,
    payoutQueues: [
      {
        speed: "fast" as const,
        queueName: onchain.send.payoutSpeeds.fast.queueName,
        displayName: onchain.send.payoutSpeeds.fast.displayName,
        description: onchain.send.payoutSpeeds.fast.description,
      },
      {
        speed: "medium" as const,
        queueName: onchain.send.payoutSpeeds.medium.queueName,
        displayName: onchain.send.payoutSpeeds.medium.displayName,
        description: onchain.send.payoutSpeeds.medium.description,
      },
      {
        speed: "slow" as const,
        queueName: onchain.send.payoutSpeeds.slow.queueName,
        displayName: onchain.send.payoutSpeeds.slow.displayName,
        description: onchain.send.payoutSpeeds.slow.description,
      },
    ],
    rebalances: {
      hotToCold: {
        threshold: onchain.send.rebalance.threshold as Satoshis,
        minRebalanceSize: onchain.send.rebalance.minRebalanceSize as Satoshis,
        minBalance: onchain.send.rebalance.minBalance as Satoshis,
        payoutQueueName: onchain.send.rebalance.payoutQueueName,
      },
      receiveToWithdrawal: {
        threshold: onchain.receive.rebalance.threshold as Satoshis,
        minRebalanceSize: onchain.receive.rebalance.minRebalanceSize as Satoshis,
        minBalance: onchain.receive.rebalance.minBalance as Satoshis,
        payoutQueueName: onchain.receive.rebalance.payoutQueueName,
      },
    },
  }
}

export const getLightningAddressDomain = (): string =>
  yamlConfig.paymentNetworks.lightning.receive.addressDomain

export const getLightningAddressDomainAliases = (): string[] =>
  yamlConfig.paymentNetworks.lightning.receive.addressDomainAliases

export const getLocale = (): UserLanguage => yamlConfig.locale as UserLanguage

export const getValuesToSkipProbe = (): SkipFeeProbeConfig => {
  const skipProbe = yamlConfig.paymentNetworks.lightning.send.skipFeeProbe
  return {
    pubkey: (skipProbe.pubkeys || []) as Pubkey[],
    chanId: (skipProbe.chanIds || []) as ChanId[],
  }
}

export const getDisplayCurrencyConfig = (): {
  code: DisplayCurrency
  symbol: string
} => ({
  code: yamlConfig.displayCurrency.code as DisplayCurrency,
  symbol: yamlConfig.displayCurrency.symbol,
})

export const getDealerConfig = () => yamlConfig.dealer

export const getAccountLimits = ({
  level,
  accountLimits = yamlConfig.accountLimits,
}: AccountLimitsArgs): IAccountLimits => {
  return {
    intraLedgerLimit: toCents(accountLimits.intraLedger.level[level]),
    withdrawalLimit: toCents(accountLimits.withdrawal.level[level]),
    tradeIntraAccountLimit: toCents(accountLimits.tradeIntraAccount.level[level]),
  }
}

const getRateLimits = (config: RateLimitInput): RateLimitOptions => {
  /**
   * Returns a subset of the required parameters for the
   * 'rate-limiter-flexible.RateLimiterRedis' object.
   */
  return {
    points: config.points,
    duration: toSeconds(config.duration),
    blockDuration: toSeconds(config.blockDuration),
  }
}

export const getRequestCodePerEmailLimits = () =>
  getRateLimits(yamlConfig.rateLimits.requestCodePerEmail)

export const getRequestCodePerPhoneNumberLimits = () =>
  getRateLimits(yamlConfig.rateLimits.requestCodePerPhoneNumber)

export const getRequestCodePerIpLimits = () =>
  getRateLimits(yamlConfig.rateLimits.requestCodePerIp)

export const getRequestTelegramPassportNoncePerPhoneNumberLimits = () =>
  getRateLimits(yamlConfig.rateLimits.requestTelegramPassportNoncePerPhoneNumber)

export const getRequestTelegramPassportNoncePerIpLimits = () =>
  getRateLimits(yamlConfig.rateLimits.requestTelegramPassportNoncePerIp)

export const getLoginAttemptPerLoginIdentifierLimits = () =>
  getRateLimits(yamlConfig.rateLimits.loginAttemptPerLoginIdentifier)

export const getFailedLoginAttemptPerIpLimits = () =>
  getRateLimits(yamlConfig.rateLimits.failedLoginAttemptPerIp)

export const getInvoiceCreateAttemptLimits = () =>
  getRateLimits(yamlConfig.rateLimits.invoiceCreateAttempt)

export const getInvoiceCreateForRecipientAttemptLimits = () =>
  getRateLimits(yamlConfig.rateLimits.invoiceCreateForRecipientAttempt)

export const getOnChainAddressCreateAttemptLimits = () =>
  getRateLimits(yamlConfig.rateLimits.onChainAddressCreateAttempt)

export const getDeviceAccountCreateAttemptLimits = () =>
  getRateLimits(yamlConfig.rateLimits.deviceAccountCreateAttempt)

export const getAppcheckJtiAttemptLimits = () =>
  getRateLimits(yamlConfig.rateLimits.requestCodePerAppcheckJti)

export const getAddQuizPerIpLimits = () =>
  getRateLimits(yamlConfig.rateLimits.addQuizPerIp)

export const getAddQuizPerPhoneLimits = () =>
  getRateLimits(yamlConfig.rateLimits.addQuizPerPhone)

export const getOnChainWalletConfig = () => ({
  dustThreshold: yamlConfig.paymentNetworks.onchain.dustThreshold,
})

export const getBuildVersions = (): {
  minBuildNumberAndroid: number
  lastBuildNumberAndroid: number
  minBuildNumberIos: number
  lastBuildNumberIos: number
} => {
  const { android, ios } = yamlConfig.buildVersion

  return {
    minBuildNumberAndroid: android.minBuildNumber,
    lastBuildNumberAndroid: android.lastBuildNumber,
    minBuildNumberIos: ios.minBuildNumber,
    lastBuildNumberIos: ios.lastBuildNumber,
  }
}

export const getIpConfig = (config = yamlConfig): IpConfig => ({
  ipRecordingEnabled: config.ipRecording.enabled,
  proxyCheckingEnabled: config.ipRecording.proxyChecking.enabled,
})

export const LND_SCB_BACKUP_BUCKET_NAME =
  yamlConfig.paymentNetworks.lightning.channels.backupBucketName

export const getAdminAccounts = (config = yamlConfig): AdminAccount[] =>
  config.admin_accounts.map((account) => ({
    role: account.role as AdminRole,
    phone: account.phone as PhoneNumber,
  }))

export const getTestAccounts = (config = yamlConfig): TestAccount[] =>
  config.test_accounts.map((account) => ({
    phone: account.phone as PhoneNumber,
    code: account.code as PhoneCode,
  }))

export const getCronConfig = (config = yamlConfig): CronConfig => config.cronConfig

export const getCaptcha = (config = yamlConfig): CaptchaConfig => config.captcha

export const getQuizzesConfig = (): QuizzesConfig => {
  const denyPhoneCountries = yamlConfig.quizzes.denyPhoneCountries || []
  const allowPhoneCountries = yamlConfig.quizzes.allowPhoneCountries || []
  const denyIPCountries = yamlConfig.quizzes.denyIPCountries || []
  const allowIPCountries = yamlConfig.quizzes.allowIPCountries || []
  const denyASNs = yamlConfig.quizzes.denyASNs || []
  const allowASNs = yamlConfig.quizzes.allowASNs || []

  return {
    phoneMetadataValidationSettings: {
      denyCountries: denyPhoneCountries.map((c) => c.toUpperCase()),
      allowCountries: allowPhoneCountries.map((c) => c.toUpperCase()),
    },
    ipMetadataValidationSettings: {
      denyCountries: denyIPCountries.map((c) => c.toUpperCase()),
      allowCountries: allowIPCountries.map((c) => c.toUpperCase()),
      denyASNs: denyASNs.map((c) => c.toUpperCase()),
      allowASNs: allowASNs.map((c) => c.toUpperCase()),
      checkProxy: yamlConfig.quizzes.enableIpProxyCheck,
    },
  }
}

export const getDefaultAccountsConfig = (config = yamlConfig): AccountsConfig => ({
  initialStatus: config.accounts.initialStatus as AccountStatus,
  initialWallets: config.accounts.initialWallets,
  initialLevel: AccountLevel.One,
  maxDeletions: config.accounts.maxDeletions || 2,
})

export const getAccountsOnboardConfig = (config = yamlConfig): AccountsOnboardConfig => {
  const { enablePhoneCheck, enableIpCheck, enableIpProxyCheck } = config.accounts

  const denyPhoneCountries = config.accounts.denyPhoneCountries || []
  const allowPhoneCountries = config.accounts.allowPhoneCountries || []
  const denyIPCountries = config.accounts.denyIPCountries || []
  const allowIPCountries = config.accounts.allowIPCountries || []
  const denyASNs = config.accounts.denyASNs || []
  const allowASNs = config.accounts.allowASNs || []

  return {
    phoneMetadataValidationSettings: {
      enabled: enablePhoneCheck,
      denyCountries: denyPhoneCountries.map((c) => c.toUpperCase()),
      allowCountries: allowPhoneCountries.map((c) => c.toUpperCase()),
    },
    ipMetadataValidationSettings: {
      enabled: enableIpCheck,
      denyCountries: denyIPCountries.map((c) => c.toUpperCase()),
      allowCountries: allowIPCountries.map((c) => c.toUpperCase()),
      denyASNs: denyASNs.map((c) => c.toUpperCase()),
      allowASNs: allowASNs.map((c) => c.toUpperCase()),
      checkProxy: enableIpProxyCheck,
    },
  }
}

export const getSmsAuthUnsupportedCountries = (): CountryCode[] => {
  return yamlConfig.smsAuthUnsupportedCountries as CountryCode[]
}

export const getWhatsAppAuthUnsupportedCountries = (): CountryCode[] => {
  return yamlConfig.whatsAppAuthUnsupportedCountries as CountryCode[]
}

export const getTelegramAuthUnsupportedCountries = (): CountryCode[] => {
  return yamlConfig.telegramAuthUnsupportedCountries as CountryCode[]
}

export const getPhoneProviderConfig = () => ({
  verify: yamlConfig.phoneProvider.verify,
  transactional: yamlConfig.phoneProvider.transactional,
})

export const getFeeStrategies = (): FeeStrategy[] => {
  return yamlConfig.feeStrategies
}

const resolveFeeStrategies = (strategyNames: string[]): FeeStrategy[] => {
  return strategyNames.map((name) => {
    const strategy = yamlConfig.feeStrategies.find((s) => s.name === name)
    if (!strategy) {
      throw new Error(`Fee strategy "${name}" not found in feeStrategies configuration`)
    }
    return strategy
  })
}

export const getOnchainNetworkConfig = (): OnchainNetworkConfig => {
  const onchain = yamlConfig.paymentNetworks.onchain

  return {
    dustThreshold: onchain.dustThreshold as Satoshis,
    receive: {
      walletName: onchain.receive.walletName,
      feeStrategies: resolveFeeStrategies(onchain.receive.feeStrategies),
      rebalance: {
        threshold: onchain.receive.rebalance.threshold as Satoshis,
        minRebalanceSize: onchain.receive.rebalance.minRebalanceSize as Satoshis,
        minBalance: onchain.receive.rebalance.minBalance as Satoshis,
        payoutQueueName: onchain.receive.rebalance.payoutQueueName,
        destinationWalletName: onchain.receive.rebalance.destinationWalletName,
      },
      legacy: {
        minConfirmations: getOnChainScanDepth(onchain.receive.legacy.minConfirmations),
        scanDepth: getOnChainScanDepth(onchain.receive.legacy.scanDepth),
      },
    },
    send: {
      walletName: onchain.send.walletName,
      payoutSpeeds: {
        fast: {
          speed: "fast" as const,
          queueName: onchain.send.payoutSpeeds.fast.queueName,
          displayName: onchain.send.payoutSpeeds.fast.displayName,
          description: onchain.send.payoutSpeeds.fast.description,
          feeStrategies: resolveFeeStrategies(
            onchain.send.payoutSpeeds.fast.feeStrategies,
          ),
        },
        medium: {
          speed: "medium" as const,
          queueName: onchain.send.payoutSpeeds.medium.queueName,
          displayName: onchain.send.payoutSpeeds.medium.displayName,
          description: onchain.send.payoutSpeeds.medium.description,
          feeStrategies: resolveFeeStrategies(
            onchain.send.payoutSpeeds.medium.feeStrategies,
          ),
        },
        slow: {
          speed: "slow" as const,
          queueName: onchain.send.payoutSpeeds.slow.queueName,
          displayName: onchain.send.payoutSpeeds.slow.displayName,
          description: onchain.send.payoutSpeeds.slow.description,
          feeStrategies: resolveFeeStrategies(
            onchain.send.payoutSpeeds.slow.feeStrategies,
          ),
        },
      },
      rebalance: {
        threshold: onchain.send.rebalance.threshold as Satoshis,
        minRebalanceSize: onchain.send.rebalance.minRebalanceSize as Satoshis,
        minBalance: onchain.send.rebalance.minBalance as Satoshis,
        payoutQueueName: onchain.send.rebalance.payoutQueueName,
        destinationWalletName: onchain.send.rebalance.destinationWalletName,
      },
    },
  }
}

export const getLightningNetworkConfig = (): LightningNetworkConfig => {
  const lightning = yamlConfig.paymentNetworks.lightning

  return {
    channels: {
      scanDepthChannelUpdate: getOnChainScanDepth(
        lightning.channels.scanDepthChannelUpdate,
      ),
      backupBucketName: lightning.channels.backupBucketName,
    },
    receive: {
      feeStrategies: resolveFeeStrategies(lightning.receive.feeStrategies),
      addressDomain: lightning.receive.addressDomain,
      addressDomainAliases: lightning.receive.addressDomainAliases,
    },
    send: {
      feeStrategies: resolveFeeStrategies(lightning.send.feeStrategies),
      skipFeeProbe: {
        pubkeys: (lightning.send.skipFeeProbe.pubkeys || []) as Pubkey[],
        chanIds: (lightning.send.skipFeeProbe.chanIds || []) as ChanId[],
      },
    },
  }
}

export const getIntraledgerNetworkConfig = (): IntraledgerNetworkConfig => {
  const intraledger = yamlConfig.paymentNetworks.intraledger

  return {
    receive: {
      feeStrategies: resolveFeeStrategies(intraledger.receive.feeStrategies),
    },
    send: {
      feeStrategies: resolveFeeStrategies(intraledger.send.feeStrategies),
    },
  }
}
