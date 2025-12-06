import { PayoutSpeed } from "@/domain/bitcoin/onchain"

type FeeCase = {
  feeRate: number
  satsAmount: number
  minerFee: number
  expectedSats: number
}

type MultiplierCase = {
  feeRate: number
  expectedMultiplier: number
}

type PayoutQueueConfigTestData = {
  speed: PayoutSpeed
  queueName: string
  displayName: string
  description: string
  feeMethodConfig: {
    exponentialDecay: {
      minRate: number
      maxRate: number
      divisor: number
      targetRate: number
      offset: number
      factor: number
    }
  }
}

export const exponentialDecayConfigData = {
  threshold: 4000000,
  minAmount: 21000,
  exponentialFactor: 21,
  minNetworkFee: 1,
  maxNetworkFee: 2000,
  minRate: 0.005,
  maxRate: 0.03,
  divisor: 20000,
  targetRate: 0.0025,
  offset: 1.1,
  factor: 1,
}

export const payoutQueueConfigData: PayoutQueueConfigTestData[] = [
  {
    speed: PayoutSpeed.Fast,
    queueName: "fast-queue",
    displayName: "Priority",
    description: "Fast processing",
    feeMethodConfig: {
      exponentialDecay: {
        minRate: 0.0075,
        maxRate: 0.04,
        divisor: 30000,
        targetRate: 0.005,
        offset: 1.3,
        factor: 2,
      },
    },
  },
  {
    speed: PayoutSpeed.Medium,
    queueName: "medium-queue",
    displayName: "Standard",
    description: "Medium processing",
    feeMethodConfig: {
      exponentialDecay: {
        minRate: 0.005,
        maxRate: 0.03,
        divisor: 20000,
        targetRate: 0.0025,
        offset: 1.1,
        factor: 1,
      },
    },
  },
  {
    speed: PayoutSpeed.Slow,
    queueName: "slow-queue",
    displayName: "Flexible",
    description: "Slow processing",
    feeMethodConfig: {
      exponentialDecay: {
        minRate: 0.003125,
        maxRate: 0.02,
        divisor: 12500,
        targetRate: 0.001,
        offset: 1.1,
        factor: 2,
      },
    },
  },
]

export const feeCapCasesData: {
  tier1: FeeCase[]
  tier2: FeeCase[]
  tier3: FeeCase[]
} = {
  tier1: [
    { feeRate: 1, satsAmount: 21000, minerFee: 141, expectedSats: 1306 },
    { feeRate: 2, satsAmount: 21000, minerFee: 282, expectedSats: 1489 },
    { feeRate: 4, satsAmount: 21000, minerFee: 564, expectedSats: 1855 },
    { feeRate: 6, satsAmount: 21000, minerFee: 846, expectedSats: 2220 },
    { feeRate: 8, satsAmount: 21000, minerFee: 1128, expectedSats: 2586 },
    { feeRate: 10, satsAmount: 21000, minerFee: 1410, expectedSats: 2952 },
    { feeRate: 15, satsAmount: 21000, minerFee: 2115, expectedSats: 3867 },
    { feeRate: 20, satsAmount: 21000, minerFee: 2820, expectedSats: 4782 },
    { feeRate: 30, satsAmount: 21000, minerFee: 4230, expectedSats: 6611 },
    { feeRate: 40, satsAmount: 21000, minerFee: 5640, expectedSats: 8440 },
    { feeRate: 50, satsAmount: 21000, minerFee: 7050, expectedSats: 10269 },
    { feeRate: 75, satsAmount: 21000, minerFee: 10575, expectedSats: 14843 },
    { feeRate: 100, satsAmount: 21000, minerFee: 14100, expectedSats: 19416 },
    { feeRate: 125, satsAmount: 21000, minerFee: 17625, expectedSats: 23989 },
    { feeRate: 150, satsAmount: 21000, minerFee: 21150, expectedSats: 28563 },
    { feeRate: 200, satsAmount: 21000, minerFee: 28200, expectedSats: 37709 },
    { feeRate: 300, satsAmount: 21000, minerFee: 42300, expectedSats: 56003 },
    { feeRate: 400, satsAmount: 21000, minerFee: 56400, expectedSats: 74296 },
    { feeRate: 500, satsAmount: 21000, minerFee: 70500, expectedSats: 92589 },
    { feeRate: 1000, satsAmount: 21000, minerFee: 141000, expectedSats: 184055 },
    { feeRate: 2000, satsAmount: 21000, minerFee: 282000, expectedSats: 366987 },
    { feeRate: 1, satsAmount: 100000, minerFee: 141, expectedSats: 3358 },
    { feeRate: 2, satsAmount: 100000, minerFee: 282, expectedSats: 3540 },
    { feeRate: 4, satsAmount: 100000, minerFee: 564, expectedSats: 3904 },
    { feeRate: 6, satsAmount: 100000, minerFee: 846, expectedSats: 4268 },
    { feeRate: 8, satsAmount: 100000, minerFee: 1128, expectedSats: 4632 },
    { feeRate: 10, satsAmount: 100000, minerFee: 1410, expectedSats: 4997 },
    { feeRate: 15, satsAmount: 100000, minerFee: 2115, expectedSats: 5907 },
    { feeRate: 20, satsAmount: 100000, minerFee: 2820, expectedSats: 6818 },
    { feeRate: 30, satsAmount: 100000, minerFee: 4230, expectedSats: 8639 },
    { feeRate: 40, satsAmount: 100000, minerFee: 5640, expectedSats: 10460 },
    { feeRate: 50, satsAmount: 100000, minerFee: 7050, expectedSats: 12281 },
    { feeRate: 75, satsAmount: 100000, minerFee: 10575, expectedSats: 16833 },
    { feeRate: 100, satsAmount: 100000, minerFee: 14100, expectedSats: 21386 },
    { feeRate: 125, satsAmount: 100000, minerFee: 17625, expectedSats: 25939 },
    { feeRate: 150, satsAmount: 100000, minerFee: 21150, expectedSats: 30491 },
    { feeRate: 200, satsAmount: 100000, minerFee: 28200, expectedSats: 39596 },
    { feeRate: 300, satsAmount: 100000, minerFee: 42300, expectedSats: 57807 },
    { feeRate: 400, satsAmount: 100000, minerFee: 56400, expectedSats: 76017 },
    { feeRate: 500, satsAmount: 100000, minerFee: 70500, expectedSats: 94227 },
    { feeRate: 1000, satsAmount: 100000, minerFee: 141000, expectedSats: 185279 },
    { feeRate: 2000, satsAmount: 100000, minerFee: 282000, expectedSats: 367382 },
  ],
  tier2: [
    { feeRate: 1, satsAmount: 21000, minerFee: 141, expectedSats: 927 },
    { feeRate: 2, satsAmount: 21000, minerFee: 282, expectedSats: 1081 },
    { feeRate: 4, satsAmount: 21000, minerFee: 564, expectedSats: 1391 },
    { feeRate: 6, satsAmount: 21000, minerFee: 846, expectedSats: 1701 },
    { feeRate: 8, satsAmount: 21000, minerFee: 1128, expectedSats: 2010 },
    { feeRate: 10, satsAmount: 21000, minerFee: 1410, expectedSats: 2320 },
    { feeRate: 15, satsAmount: 21000, minerFee: 2115, expectedSats: 3094 },
    { feeRate: 20, satsAmount: 21000, minerFee: 2820, expectedSats: 3868 },
    { feeRate: 30, satsAmount: 21000, minerFee: 4230, expectedSats: 5416 },
    { feeRate: 40, satsAmount: 21000, minerFee: 5640, expectedSats: 6964 },
    { feeRate: 50, satsAmount: 21000, minerFee: 7050, expectedSats: 8512 },
    { feeRate: 75, satsAmount: 21000, minerFee: 10575, expectedSats: 12383 },
    { feeRate: 100, satsAmount: 21000, minerFee: 14100, expectedSats: 16253 },
    { feeRate: 125, satsAmount: 21000, minerFee: 17625, expectedSats: 20123 },
    { feeRate: 150, satsAmount: 21000, minerFee: 21150, expectedSats: 23993 },
    { feeRate: 200, satsAmount: 21000, minerFee: 28200, expectedSats: 31734 },
    { feeRate: 300, satsAmount: 21000, minerFee: 42300, expectedSats: 47215 },
    { feeRate: 400, satsAmount: 21000, minerFee: 56400, expectedSats: 62696 },
    { feeRate: 500, satsAmount: 21000, minerFee: 70500, expectedSats: 78177 },
    { feeRate: 1000, satsAmount: 21000, minerFee: 141000, expectedSats: 155583 },
    { feeRate: 2000, satsAmount: 21000, minerFee: 282000, expectedSats: 310394 },
    { feeRate: 1, satsAmount: 100000, minerFee: 141, expectedSats: 2444 },
    { feeRate: 2, satsAmount: 100000, minerFee: 282, expectedSats: 2598 },
    { feeRate: 4, satsAmount: 100000, minerFee: 564, expectedSats: 2907 },
    { feeRate: 6, satsAmount: 100000, minerFee: 846, expectedSats: 3215 },
    { feeRate: 8, satsAmount: 100000, minerFee: 1128, expectedSats: 3523 },
    { feeRate: 10, satsAmount: 100000, minerFee: 1410, expectedSats: 3832 },
    { feeRate: 15, satsAmount: 100000, minerFee: 2115, expectedSats: 4602 },
    { feeRate: 20, satsAmount: 100000, minerFee: 2820, expectedSats: 5373 },
    { feeRate: 30, satsAmount: 100000, minerFee: 4230, expectedSats: 6915 },
    { feeRate: 40, satsAmount: 100000, minerFee: 5640, expectedSats: 8456 },
    { feeRate: 50, satsAmount: 100000, minerFee: 7050, expectedSats: 9998 },
    { feeRate: 75, satsAmount: 100000, minerFee: 10575, expectedSats: 13851 },
    { feeRate: 100, satsAmount: 100000, minerFee: 14100, expectedSats: 17705 },
    { feeRate: 125, satsAmount: 100000, minerFee: 17625, expectedSats: 21559 },
    { feeRate: 150, satsAmount: 100000, minerFee: 21150, expectedSats: 25413 },
    { feeRate: 200, satsAmount: 100000, minerFee: 28200, expectedSats: 33120 },
    { feeRate: 300, satsAmount: 100000, minerFee: 42300, expectedSats: 48535 },
    { feeRate: 400, satsAmount: 100000, minerFee: 56400, expectedSats: 63950 },
    { feeRate: 500, satsAmount: 100000, minerFee: 70500, expectedSats: 79365 },
    { feeRate: 1000, satsAmount: 100000, minerFee: 141000, expectedSats: 156441 },
    { feeRate: 2000, satsAmount: 100000, minerFee: 282000, expectedSats: 310591 },
  ],
  tier3: [
    { feeRate: 1, satsAmount: 21000, minerFee: 56, expectedSats: 594 },
    { feeRate: 2, satsAmount: 21000, minerFee: 111, expectedSats: 653 },
    { feeRate: 4, satsAmount: 21000, minerFee: 222, expectedSats: 775 },
    { feeRate: 6, satsAmount: 21000, minerFee: 334, expectedSats: 898 },
    { feeRate: 8, satsAmount: 21000, minerFee: 445, expectedSats: 1020 },
    { feeRate: 10, satsAmount: 21000, minerFee: 556, expectedSats: 1142 },
    { feeRate: 15, satsAmount: 21000, minerFee: 834, expectedSats: 1446 },
    { feeRate: 20, satsAmount: 21000, minerFee: 1112, expectedSats: 1751 },
    { feeRate: 30, satsAmount: 21000, minerFee: 1668, expectedSats: 2361 },
    { feeRate: 40, satsAmount: 21000, minerFee: 2224, expectedSats: 2970 },
    { feeRate: 50, satsAmount: 21000, minerFee: 2780, expectedSats: 3580 },
    { feeRate: 75, satsAmount: 21000, minerFee: 4170, expectedSats: 5104 },
    { feeRate: 100, satsAmount: 21000, minerFee: 5560, expectedSats: 6628 },
    { feeRate: 125, satsAmount: 21000, minerFee: 6950, expectedSats: 8152 },
    { feeRate: 150, satsAmount: 21000, minerFee: 8340, expectedSats: 9676 },
    { feeRate: 200, satsAmount: 21000, minerFee: 11120, expectedSats: 12724 },
    { feeRate: 1, satsAmount: 100000, minerFee: 56, expectedSats: 1599 },
    { feeRate: 2, satsAmount: 100000, minerFee: 111, expectedSats: 1658 },
    { feeRate: 4, satsAmount: 100000, minerFee: 222, expectedSats: 1778 },
    { feeRate: 6, satsAmount: 100000, minerFee: 334, expectedSats: 1901 },
    { feeRate: 8, satsAmount: 100000, minerFee: 445, expectedSats: 2021 },
    { feeRate: 10, satsAmount: 100000, minerFee: 556, expectedSats: 2142 },
    { feeRate: 15, satsAmount: 100000, minerFee: 834, expectedSats: 2444 },
    { feeRate: 20, satsAmount: 100000, minerFee: 1112, expectedSats: 2747 },
    { feeRate: 30, satsAmount: 100000, minerFee: 1668, expectedSats: 3352 },
    { feeRate: 40, satsAmount: 100000, minerFee: 2224, expectedSats: 3957 },
    { feeRate: 50, satsAmount: 100000, minerFee: 2780, expectedSats: 4562 },
    { feeRate: 75, satsAmount: 100000, minerFee: 4170, expectedSats: 6074 },
    { feeRate: 100, satsAmount: 100000, minerFee: 5560, expectedSats: 7587 },
    { feeRate: 125, satsAmount: 100000, minerFee: 6950, expectedSats: 9099 },
    { feeRate: 150, satsAmount: 100000, minerFee: 8340, expectedSats: 10612 },
    { feeRate: 200, satsAmount: 100000, minerFee: 11120, expectedSats: 13636 },
  ],
}

export const multiplierCasesData: {
  tier1: MultiplierCase[]
  tier2: MultiplierCase[]
  tier3: MultiplierCase[]
} = {
  tier1: [
    { feeRate: 1, expectedMultiplier: 3.3 },
    { feeRate: 2, expectedMultiplier: 2.3 },
    { feeRate: 4, expectedMultiplier: 1.8 },
    { feeRate: 8, expectedMultiplier: 1.55 },
    { feeRate: 10, expectedMultiplier: 1.5 },
    { feeRate: 15, expectedMultiplier: 1.433333 },
    { feeRate: 20, expectedMultiplier: 1.4 },
    { feeRate: 30, expectedMultiplier: 1.366667 },
    { feeRate: 40, expectedMultiplier: 1.35 },
    { feeRate: 50, expectedMultiplier: 1.34 },
    { feeRate: 75, expectedMultiplier: 1.326667 },
    { feeRate: 100, expectedMultiplier: 1.32 },
    { feeRate: 125, expectedMultiplier: 1.316 },
    { feeRate: 150, expectedMultiplier: 1.313333 },
    { feeRate: 200, expectedMultiplier: 1.31 },
    { feeRate: 300, expectedMultiplier: 1.306667 },
    { feeRate: 400, expectedMultiplier: 1.305 },
    { feeRate: 500, expectedMultiplier: 1.304 },
    { feeRate: 1000, expectedMultiplier: 1.302 },
    { feeRate: 2000, expectedMultiplier: 1.301 },
  ],
  tier2: [
    { feeRate: 1, expectedMultiplier: 2.1 },
    { feeRate: 2, expectedMultiplier: 1.6 },
    { feeRate: 4, expectedMultiplier: 1.35 },
    { feeRate: 8, expectedMultiplier: 1.225 },
    { feeRate: 10, expectedMultiplier: 1.2 },
    { feeRate: 15, expectedMultiplier: 1.166667 },
    { feeRate: 20, expectedMultiplier: 1.15 },
    { feeRate: 30, expectedMultiplier: 1.133333 },
    { feeRate: 40, expectedMultiplier: 1.125 },
    { feeRate: 50, expectedMultiplier: 1.12 },
    { feeRate: 75, expectedMultiplier: 1.113333 },
    { feeRate: 100, expectedMultiplier: 1.11 },
    { feeRate: 125, expectedMultiplier: 1.108 },
    { feeRate: 150, expectedMultiplier: 1.106667 },
    { feeRate: 200, expectedMultiplier: 1.105 },
    { feeRate: 300, expectedMultiplier: 1.103333 },
    { feeRate: 400, expectedMultiplier: 1.1025 },
    { feeRate: 500, expectedMultiplier: 1.102 },
    { feeRate: 1000, expectedMultiplier: 1.101 },
    { feeRate: 2000, expectedMultiplier: 1.1005 },
  ],
  tier3: [
    { feeRate: 1, expectedMultiplier: 3.1 },
    { feeRate: 2, expectedMultiplier: 2.1 },
    { feeRate: 4, expectedMultiplier: 1.6 },
    { feeRate: 8, expectedMultiplier: 1.35 },
    { feeRate: 10, expectedMultiplier: 1.3 },
    { feeRate: 15, expectedMultiplier: 1.233333 },
    { feeRate: 20, expectedMultiplier: 1.2 },
    { feeRate: 30, expectedMultiplier: 1.166667 },
    { feeRate: 40, expectedMultiplier: 1.15 },
    { feeRate: 50, expectedMultiplier: 1.14 },
    { feeRate: 75, expectedMultiplier: 1.126667 },
    { feeRate: 100, expectedMultiplier: 1.12 },
    { feeRate: 125, expectedMultiplier: 1.116 },
    { feeRate: 150, expectedMultiplier: 1.113333 },
    { feeRate: 200, expectedMultiplier: 1.11 },
    { feeRate: 300, expectedMultiplier: 1.106667 },
    { feeRate: 400, expectedMultiplier: 1.105 },
    { feeRate: 500, expectedMultiplier: 1.104 },
    { feeRate: 1000, expectedMultiplier: 1.102 },
    { feeRate: 2000, expectedMultiplier: 1.101 },
  ],
}
