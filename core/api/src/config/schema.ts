import { AccountStatus } from "@/domain/accounts/primitives"
import { WalletCurrency } from "@/domain/shared"

const displayCurrencyConfigSchema = {
  type: "object",
  properties: {
    code: { type: "string" },
    symbol: { type: "string" },
  },
  required: ["code", "symbol"],
  additionalProperties: false,
  default: {
    code: "USD",
    symbol: "$",
  },
} as const

const dealerConfigSchema = {
  type: "object",
  properties: {
    usd: {
      type: "object",
      properties: {
        hedgingEnabled: { type: "boolean" },
      },
      required: ["hedgingEnabled"],
    },
  },
  required: ["usd"],
  default: {
    usd: {
      hedgingEnabled: false,
    },
  },
} as const

const buildNumberConfigSchema = {
  type: "object",
  properties: {
    minBuildNumber: { type: "integer" },
    lastBuildNumber: { type: "integer" },
  },
  required: ["minBuildNumber", "lastBuildNumber"],
  additionalProperties: false,
} as const

const accountLimitConfigSchema = {
  type: "object",
  properties: {
    level: {
      type: "object",
      properties: {
        0: { type: "integer" },
        1: { type: "integer" },
        2: { type: "integer" },
        3: { type: "integer" },
      },
      required: ["0", "1", "2", "3"],
      additionalProperties: false,
    },
  },
  required: ["level"],
  additionalProperties: false,
}

const rateLimitConfigSchema = {
  type: "object",
  properties: {
    points: { type: "integer" },
    duration: { type: "integer" },
    blockDuration: { type: "integer" },
  },
  required: ["points", "duration", "blockDuration"],
  additionalProperties: false,
}

const feeStrategySchema = {
  type: "object",
  required: ["name", "strategy", "params"],
  discriminator: { propertyName: "strategy" },
  oneOf: [
    {
      properties: {
        additionalProperties: false,
        name: { type: "string" },
        strategy: { const: "flat" },
        params: {
          type: "object",
          required: ["amount"],
          additionalProperties: false,
          properties: {
            amount: { type: "integer", minimum: 0 },
          },
        },
      },
    },
    {
      properties: {
        additionalProperties: false,
        name: { type: "string" },
        strategy: { const: "percentage" },
        params: {
          type: "object",
          required: ["basisPoints"],
          additionalProperties: false,
          properties: {
            basisPoints: { type: "integer", minimum: 0 },
          },
        },
      },
    },
    {
      properties: {
        additionalProperties: false,
        name: { type: "string" },
        strategy: { const: "tieredFlat" },
        params: {
          type: "object",
          required: ["tiers"],
          additionalProperties: false,
          properties: {
            tiers: {
              type: "array",
              minItems: 1,
              items: {
                type: "object",
                required: ["maxAmount", "amount"],
                additionalProperties: false,
                properties: {
                  maxAmount: {
                    anyOf: [{ type: "integer", minimum: 0 }, { type: "null" }],
                  },
                  amount: { type: "integer", minimum: 0 },
                },
              },
            },
          },
        },
      },
    },
    {
      properties: {
        additionalProperties: false,
        name: { type: "string" },
        strategy: { const: "exemptAccount" },
        params: {
          type: "object",
          required: ["roles", "accountIds"],
          additionalProperties: false,
          properties: {
            roles: {
              type: "array",
              items: { type: "string" },
              uniqueItems: true,
            },
            accountIds: {
              type: "array",
              items: { type: "string" },
              uniqueItems: true,
            },
            exemptValidatedMerchants: { type: "boolean", default: false },
          },
        },
      },
    },
    {
      properties: {
        additionalProperties: false,
        name: { type: "string" },
        strategy: { const: "imbalance" },
        params: {
          type: "object",
          required: ["threshold", "ratioAsBasisPoints", "daysLookback", "minFee"],
          additionalProperties: false,
          properties: {
            threshold: { type: "integer", minimum: 0 },
            ratioAsBasisPoints: { type: "integer", minimum: 0 },
            daysLookback: { type: "integer", minimum: 1 },
            minFee: { type: "integer", minimum: 0 },
          },
        },
      },
    },
    {
      properties: {
        additionalProperties: false,
        name: { type: "string" },
        strategy: { const: "exponentialDecay" },
        params: {
          type: "object",
          required: [
            "decayStartAmount",
            "baseAmount",
            "decaySpeed",
            "minFeeRate",
            "maxFeeRate",
            "minRate",
            "maxRate",
            "terminalDivisor",
            "targetFeeRate",
            "networkFeeOffset",
            "networkFeeFactor",
          ],
          additionalProperties: false,
          properties: {
            decayStartAmount: {
              type: "integer",
              minimum: 0,
              exclusiveMinimum: { $data: "1/baseAmount" },
            },
            baseAmount: { type: "integer", minimum: 0 },
            decaySpeed: { type: "number", minimum: 0 },
            minFeeRate: { type: "number", minimum: 0 },
            maxFeeRate: {
              type: "number",
              minimum: 0,
              exclusiveMinimum: { $data: "1/minFeeRate" },
            },
            minRate: { type: "number", minimum: 0 },
            maxRate: { type: "number", minimum: 0 },
            terminalDivisor: { type: "integer", minimum: 1 },
            targetFeeRate: { type: "number", minimum: 0 },
            networkFeeOffset: { type: "number", minimum: 0 },
            networkFeeFactor: { type: "number", minimum: 0 },
          },
        },
      },
    },
  ],
}

const payoutSpeedConfigSchema = {
  type: "object",
  properties: {
    queueName: { type: "string" },
    displayName: { type: "string" },
    description: { type: "string" },
    feeStrategies: {
      type: "array",
      items: { type: "string" },
      uniqueItems: true,
    },
  },
  required: ["queueName", "displayName", "description", "feeStrategies"],
  additionalProperties: false,
} as const

const rebalanceConfigSchema = {
  type: "object",
  properties: {
    threshold: { type: "integer" },
    minRebalanceSize: { type: "integer" },
    minBalance: { type: "integer" },
    payoutQueueName: { type: "string" },
    destinationWalletName: { type: "string" },
  },
  required: [
    "threshold",
    "minRebalanceSize",
    "minBalance",
    "payoutQueueName",
    "destinationWalletName",
  ],
  additionalProperties: false,
} as const

const paymentNetworksSchema = {
  type: "object",
  properties: {
    onchain: {
      type: "object",
      properties: {
        dustThreshold: { type: "integer" },
        receive: {
          type: "object",
          properties: {
            walletName: { type: "string" },
            feeStrategies: {
              type: "array",
              items: { type: "string" },
              uniqueItems: true,
            },
            rebalance: rebalanceConfigSchema,
            legacy: {
              type: "object",
              properties: {
                minConfirmations: { type: "integer" },
                scanDepth: { type: "integer" },
              },
              required: ["minConfirmations", "scanDepth"],
              additionalProperties: false,
            },
          },
          required: ["walletName", "feeStrategies", "rebalance", "legacy"],
          additionalProperties: false,
        },
        send: {
          type: "object",
          properties: {
            walletName: { type: "string" },
            payoutSpeeds: {
              type: "object",
              properties: {
                fast: payoutSpeedConfigSchema,
                medium: payoutSpeedConfigSchema,
                slow: payoutSpeedConfigSchema,
              },
              required: ["fast", "medium", "slow"],
              additionalProperties: false,
            },
            rebalance: rebalanceConfigSchema,
          },
          required: ["walletName", "payoutSpeeds", "rebalance"],
          additionalProperties: false,
        },
      },
      required: ["dustThreshold", "receive", "send"],
      additionalProperties: false,
    },
    lightning: {
      type: "object",
      properties: {
        channels: {
          type: "object",
          properties: {
            scanDepthChannelUpdate: { type: "integer" },
            backupBucketName: { type: "string" },
          },
          required: ["scanDepthChannelUpdate", "backupBucketName"],
          additionalProperties: false,
        },
        receive: {
          type: "object",
          properties: {
            feeStrategies: {
              type: "array",
              items: { type: "string" },
              uniqueItems: true,
            },
            addressDomain: { type: "string" },
            addressDomainAliases: {
              type: "array",
              items: { type: "string" },
              uniqueItems: true,
            },
          },
          required: ["feeStrategies", "addressDomain", "addressDomainAliases"],
          additionalProperties: false,
        },
        send: {
          type: "object",
          properties: {
            feeStrategies: {
              type: "array",
              items: { type: "string" },
              uniqueItems: true,
            },
            skipFeeProbe: {
              type: "object",
              properties: {
                pubkeys: {
                  type: "array",
                  items: { type: "string", maxLength: 66, minLength: 66 },
                  uniqueItems: true,
                },
                chanIds: {
                  type: "array",
                  items: { type: "string" },
                  uniqueItems: true,
                },
              },
              required: ["pubkeys", "chanIds"],
              additionalProperties: false,
            },
          },
          required: ["feeStrategies", "skipFeeProbe"],
          additionalProperties: false,
        },
      },
      required: ["channels", "receive", "send"],
      additionalProperties: false,
    },
    intraledger: {
      type: "object",
      properties: {
        receive: {
          type: "object",
          properties: {
            feeStrategies: {
              type: "array",
              items: { type: "string" },
              uniqueItems: true,
            },
          },
          required: ["feeStrategies"],
          additionalProperties: false,
        },
        send: {
          type: "object",
          properties: {
            feeStrategies: {
              type: "array",
              items: { type: "string" },
              uniqueItems: true,
            },
          },
          required: ["feeStrategies"],
          additionalProperties: false,
        },
      },
      required: ["receive", "send"],
      additionalProperties: false,
    },
  },
  required: ["onchain", "lightning", "intraledger"],
  additionalProperties: false,
  default: {
    onchain: {
      dustThreshold: 5000,
      receive: {
        walletName: "dev-wallet",
        feeStrategies: ["tiered_receive", "internal_receive"],
        rebalance: {
          threshold: 25000000,
          minRebalanceSize: 25000000,
          minBalance: 100000,
          payoutQueueName: "dev-queue",
          destinationWalletName: "dev-wallet",
        },
        legacy: {
          minConfirmations: 2,
          scanDepth: 360,
        },
      },
      send: {
        walletName: "dev-wallet",
        payoutSpeeds: {
          fast: {
            queueName: "dev-queue",
            displayName: "Priority",
            description: "Estimated broadcast ~10 minutes",
            feeStrategies: ["tiered_send", "imbalance_withdrawal", "internal_send"],
          },
          medium: {
            queueName: "dev-medium-queue",
            displayName: "Standard",
            description: "Estimated broadcast ~1 hour",
            feeStrategies: ["tiered_send", "imbalance_withdrawal", "internal_send"],
          },
          slow: {
            queueName: "dev-slow-queue",
            displayName: "Flexible",
            description: "Estimated broadcast ~24 hours",
            feeStrategies: ["tiered_send", "imbalance_withdrawal", "internal_send"],
          },
        },
        rebalance: {
          threshold: 200000000,
          minRebalanceSize: 10000000,
          minBalance: 1000000,
          payoutQueueName: "dev-queue",
          destinationWalletName: "cold",
        },
      },
    },
    lightning: {
      channels: {
        scanDepthChannelUpdate: 8,
        backupBucketName: "lnd-static-channel-backups",
      },
      receive: {
        feeStrategies: ["zero_fee"],
        addressDomain: "pay.domain.com",
        addressDomainAliases: ["pay1.domain.com", "pay2.domain.com"],
      },
      send: {
        feeStrategies: ["zero_fee"],
        skipFeeProbe: {
          pubkeys: [],
          chanIds: [],
        },
      },
    },
    intraledger: {
      receive: {
        feeStrategies: ["zero_fee"],
      },
      send: {
        feeStrategies: ["zero_fee"],
      },
    },
  },
} as const

export const configSchema = {
  type: "object",
  properties: {
    locale: { type: "string", enum: ["en", "es"], default: "en" },
    displayCurrency: displayCurrencyConfigSchema,
    funder: { type: "string", default: "FunderWallet" },
    dealer: dealerConfigSchema,
    ratioPrecision: { type: "number", default: 1000000 },
    buildVersion: {
      type: "object",
      properties: {
        android: buildNumberConfigSchema,
        ios: buildNumberConfigSchema,
      },
      default: {
        android: {
          minBuildNumber: 362,
          lastBuildNumber: 362,
        },
        ios: {
          minBuildNumber: 362,
          lastBuildNumber: 362,
        },
      },
      required: ["ios", "android"],
      additionalProperties: false,
    },
    quizzes: {
      type: "object",
      properties: {
        enableIpProxyCheck: { type: "boolean" },
        allowPhoneCountries: {
          type: "array",
          items: { type: "string" },
          uniqueItems: true,
        },
        denyPhoneCountries: {
          type: "array",
          items: { type: "string" },
          uniqueItems: true,
        },
        allowIPCountries: {
          type: "array",
          items: { type: "string" },
          uniqueItems: true,
        },
        denyIPCountries: {
          type: "array",
          items: { type: "string" },
          uniqueItems: true,
        },
        allowASNs: {
          type: "array",
          items: { type: "string" },
          uniqueItems: true,
        },
        denyASNs: {
          type: "array",
          items: { type: "string" },
          uniqueItems: true,
        },
      },
      required: [
        "enableIpProxyCheck",
        "allowPhoneCountries",
        "denyPhoneCountries",
        "allowIPCountries",
        "denyIPCountries",
        "allowASNs",
        "denyASNs",
      ],
      additionalProperties: false,
      default: {
        enableIpProxyCheck: true,
        allowPhoneCountries: [],
        denyPhoneCountries: [],
        allowIPCountries: [],
        denyIPCountries: [],
        allowASNs: [],
        denyASNs: [],
      },
    },
    admin_accounts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          role: { type: "string" },
          phone: { type: "string" },
        },
        required: ["role", "phone"],
        additionalProperties: false,
      },
      default: [
        {
          role: "dealer",
          phone: "+16505554327",
        },
        {
          role: "funder",
          phone: "+16505554325",
        },
        {
          role: "bankowner",
          phone: "+16505554334",
        },
      ],
      uniqueItems: true,
    },
    test_accounts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          phone: { type: "string" },
          code: { type: "string" },
        },
        required: ["phone", "code"],
        additionalProperties: false,
      },
      default: [],
      uniqueItems: true,
    },
    rateLimits: {
      type: "object",
      properties: {
        requestCodePerEmail: rateLimitConfigSchema,
        requestCodePerPhoneNumber: rateLimitConfigSchema,
        requestCodePerIp: rateLimitConfigSchema,
        requestTelegramPassportNoncePerPhoneNumber: rateLimitConfigSchema,
        requestTelegramPassportNoncePerIp: rateLimitConfigSchema,
        loginAttemptPerLoginIdentifier: rateLimitConfigSchema,
        failedLoginAttemptPerIp: rateLimitConfigSchema,
        invoiceCreateAttempt: rateLimitConfigSchema,
        invoiceCreateForRecipientAttempt: rateLimitConfigSchema,
        onChainAddressCreateAttempt: rateLimitConfigSchema,
        deviceAccountCreateAttempt: rateLimitConfigSchema,
        requestCodePerAppcheckJti: rateLimitConfigSchema,
        addQuizPerIp: rateLimitConfigSchema,
        addQuizPerPhone: rateLimitConfigSchema,
      },
      required: [
        "requestCodePerEmail",
        "requestCodePerPhoneNumber",
        "requestCodePerIp",
        "requestTelegramPassportNoncePerPhoneNumber",
        "requestTelegramPassportNoncePerIp",
        "loginAttemptPerLoginIdentifier",
        "failedLoginAttemptPerIp",
        "invoiceCreateAttempt",
        "invoiceCreateForRecipientAttempt",
        "onChainAddressCreateAttempt",
        "deviceAccountCreateAttempt",
        "requestCodePerAppcheckJti",
        "addQuizPerIp",
        "addQuizPerPhone",
      ],
      additionalProperties: false,
      default: {
        requestCodePerEmail: {
          points: 4,
          duration: 3600,
          blockDuration: 10800,
        },
        requestCodePerPhoneNumber: {
          points: 4,
          duration: 259200,
          blockDuration: 259200,
        },
        requestCodePerIp: {
          points: 16,
          duration: 3600,
          blockDuration: 86400,
        },
        requestTelegramPassportNoncePerPhoneNumber: {
          points: 5,
          duration: 3600,
          blockDuration: 86400,
        },
        requestTelegramPassportNoncePerIp: {
          points: 25,
          duration: 300,
          blockDuration: 3600,
        },
        loginAttemptPerLoginIdentifier: {
          points: 6,
          duration: 3600,
          blockDuration: 7200,
        },
        failedLoginAttemptPerIp: {
          points: 20,
          duration: 21600,
          blockDuration: 86400,
        },
        invoiceCreateAttempt: {
          points: 60,
          duration: 60,
          blockDuration: 300,
        },
        invoiceCreateForRecipientAttempt: {
          points: 60,
          duration: 60,
          blockDuration: 300,
        },
        onChainAddressCreateAttempt: {
          points: 20,
          duration: 3600,
          blockDuration: 14400,
        },
        deviceAccountCreateAttempt: {
          points: 2,
          duration: 86400,
          blockDuration: 86400,
        },
        requestCodePerAppcheckJti: {
          points: 6,
          duration: 86400,
          blockDuration: 86400,
        },
        addQuizPerIp: {
          points: 50,
          duration: 86400,
          blockDuration: 604800,
        },
        addQuizPerPhone: {
          points: 20,
          duration: 86400,
          blockDuration: 604800,
        },
      },
    },
    accounts: {
      type: "object",
      properties: {
        initialStatus: { type: "string", enum: Object.values(AccountStatus) },
        initialWallets: {
          type: "array",
          items: {
            type: "string",
            enum: Object.values(WalletCurrency),
          },
        },
        enablePhoneCheck: { type: "boolean" },
        enableIpCheck: { type: "boolean" },
        enableIpProxyCheck: { type: "boolean" },
        allowPhoneCountries: {
          type: "array",
          items: { type: "string" },
          uniqueItems: true,
        },
        denyPhoneCountries: {
          type: "array",
          items: { type: "string" },
          uniqueItems: true,
        },
        allowIPCountries: {
          type: "array",
          items: { type: "string" },
          uniqueItems: true,
        },
        denyIPCountries: {
          type: "array",
          items: { type: "string" },
          uniqueItems: true,
        },
        allowASNs: {
          type: "array",
          items: { type: "string" },
          uniqueItems: true,
        },
        denyASNs: {
          type: "array",
          items: { type: "string" },
          uniqueItems: true,
        },
        maxDeletions: { type: "number", default: 2 },
      },
      required: [
        "initialStatus",
        "initialWallets",
        "enablePhoneCheck",
        "enableIpCheck",
        "enableIpProxyCheck",
        "allowPhoneCountries",
        "denyPhoneCountries",
        "allowIPCountries",
        "denyIPCountries",
        "allowASNs",
        "denyASNs",
        "maxDeletions",
      ],
      additionalProperties: false,
      default: {
        initialStatus: "active",
        initialWallets: ["BTC", "USD"],
        enablePhoneCheck: false,
        enableIpCheck: false,
        enableIpProxyCheck: false,
        allowPhoneCountries: [],
        denyPhoneCountries: [],
        allowIPCountries: [],
        denyIPCountries: [],
        allowASNs: [],
        denyASNs: [],
      },
    },
    accountLimits: {
      type: "object",
      properties: {
        withdrawal: accountLimitConfigSchema,
        intraLedger: accountLimitConfigSchema,
        tradeIntraAccount: accountLimitConfigSchema,
      },
      required: ["withdrawal", "intraLedger", "tradeIntraAccount"],
      additionalProperties: false,
      default: {
        withdrawal: {
          level: {
            "0": 12500,
            "1": 100000,
            "2": 5000000,
            "3": 10000000,
          },
        },
        intraLedger: {
          level: {
            "0": 12500,
            "1": 200000,
            "2": 5000000,
            "3": 10000000,
          },
        },
        tradeIntraAccount: {
          level: {
            "0": 200000,
            "1": 5000000,
            "2": 20000000,
            "3": 30000000,
          },
        },
      },
    },
    spamLimits: {
      type: "object",
      properties: {
        memoSharingSatsThreshold: { type: "integer" },
        memoSharingCentsThreshold: { type: "integer" },
      },
      required: ["memoSharingSatsThreshold", "memoSharingCentsThreshold"],
      additionalProperties: false,
      default: {
        memoSharingSatsThreshold: 50,
        memoSharingCentsThreshold: 10,
      },
    },
    ipRecording: {
      type: "object",
      properties: {
        enabled: { type: "boolean" },
        proxyChecking: {
          type: "object",
          properties: {
            enabled: { type: "boolean" },
          },
          required: ["enabled"],
          additionalProperties: false,
        },
      },
      required: ["enabled"],
      additionalProperties: false,
      default: {
        enabled: false,
        proxyChecking: {
          enabled: false,
        },
      },
    },
    feeStrategies: {
      type: "array",
      items: feeStrategySchema,
      default: [
        {
          name: "zero_fee",
          strategy: "flat",
          params: { amount: 0 },
        },
        {
          name: "flat_2500",
          strategy: "flat",
          params: { amount: 2500 },
        },
        {
          name: "percentage_50bp",
          strategy: "percentage",
          params: { basisPoints: 50 },
        },
        {
          name: "tiered_receive",
          strategy: "tieredFlat",
          params: {
            tiers: [
              { maxAmount: 1000000, amount: 2500 },
              { maxAmount: null, amount: 0 },
            ],
          },
        },
        {
          name: "tiered_send",
          strategy: "tieredFlat",
          params: {
            tiers: [
              { maxAmount: 1000000, amount: 5000 },
              { maxAmount: null, amount: 10000 },
            ],
          },
        },
        {
          name: "internal_receive",
          strategy: "exemptAccount",
          params: {
            roles: ["bankowner", "dealer"],
            accountIds: [],
            exemptValidatedMerchants: true,
          },
        },
        {
          name: "internal_send",
          strategy: "exemptAccount",
          params: {
            roles: ["bankowner", "dealer"],
            accountIds: [],
            exemptValidatedMerchants: false,
          },
        },
        {
          name: "imbalance_withdrawal",
          strategy: "imbalance",
          params: {
            threshold: 10000000,
            ratioAsBasisPoints: 20,
            daysLookback: 30,
            minFee: 0,
          },
        },
        {
          name: "exponential_decay_fast",
          strategy: "exponentialDecay",
          params: {
            decayStartAmount: 4000000,
            baseAmount: 21000,
            decaySpeed: 21.0,
            minFeeRate: 1,
            maxFeeRate: 2000,
            minRate: 0.0075,
            maxRate: 0.04,
            terminalDivisor: 30000,
            targetFeeRate: 0.005,
            networkFeeOffset: 1.3,
            networkFeeFactor: 2.0,
          },
        },
        {
          name: "exponential_decay_medium",
          strategy: "exponentialDecay",
          params: {
            decayStartAmount: 4000000,
            baseAmount: 21000,
            decaySpeed: 21.0,
            minFeeRate: 1,
            maxFeeRate: 2000,
            minRate: 0.005,
            maxRate: 0.03,
            terminalDivisor: 20000,
            targetFeeRate: 0.0025,
            networkFeeOffset: 1.1,
            networkFeeFactor: 1.0,
          },
        },
        {
          name: "exponential_decay_slow",
          strategy: "exponentialDecay",
          params: {
            decayStartAmount: 4000000,
            baseAmount: 21000,
            decaySpeed: 21.0,
            minFeeRate: 1,
            maxFeeRate: 2000,
            minRate: 0.003125,
            maxRate: 0.02,
            terminalDivisor: 12500,
            targetFeeRate: 0.001,
            networkFeeOffset: 1.1,
            networkFeeFactor: 2.0,
          },
        },
      ],
    },
    paymentNetworks: paymentNetworksSchema,
    userActivenessMonthlyVolumeThreshold: { type: "integer", default: 100 },
    cronConfig: {
      type: "object",
      properties: {
        rebalanceEnabled: { type: "boolean" },
        removeInactiveMerchantsEnabled: { type: "boolean" },
      },
      required: ["rebalanceEnabled", "removeInactiveMerchantsEnabled"],
      additionalProperties: false,
      default: {
        rebalanceEnabled: true,
        removeInactiveMerchantsEnabled: true,
      },
    },
    captcha: {
      type: "object",
      properties: {
        mandatory: { type: "boolean" },
      },
      required: ["mandatory"],
      additionalProperties: false,
      default: { mandatory: false },
    },
    smsAuthUnsupportedCountries: {
      type: "array",
      items: { type: "string" },
      default: [],
    },
    whatsAppAuthUnsupportedCountries: {
      type: "array",
      items: { type: "string" },
      default: [],
    },
    telegramAuthUnsupportedCountries: {
      type: "array",
      items: { type: "string" },
      default: [],
    },
    phoneProvider: {
      type: "object",
      properties: {
        verify: { type: "string", enum: ["prelude", "twilio"] },
        transactional: { type: "string", enum: ["prelude", "twilio"] },
      },
      required: ["verify", "transactional"],
      additionalProperties: false,
      default: {
        verify: "twilio",
        transactional: "twilio",
      },
    },
  },
  required: [
    "locale",
    "displayCurrency",
    "funder",
    "dealer",
    "ratioPrecision",
    "buildVersion",
    "quizzes",
    "admin_accounts",
    "test_accounts",
    "rateLimits",
    "accounts",
    "accountLimits",
    "spamLimits",
    "ipRecording",
    "paymentNetworks",
    "userActivenessMonthlyVolumeThreshold",
    "cronConfig",
    "captcha",
    "smsAuthUnsupportedCountries",
    "whatsAppAuthUnsupportedCountries",
    "telegramAuthUnsupportedCountries",
    "phoneProvider",
  ],
  additionalProperties: false,
} as const
