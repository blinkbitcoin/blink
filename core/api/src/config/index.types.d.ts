type SkipFeeProbeFeeCapGroup = {
  pubkey: Pubkey[]
  feeCapBasisPoints: bigint
}

type SkipFeeProbeConfig = {
  pubkey: Pubkey[]
  chanId: ChanId[]
  feeCapGroups: SkipFeeProbeFeeCapGroup[]
}

type CustodialMigrationFlowConfig = {
  enabled: boolean
  deMinimisThresholdSats: number
  recentDepositThresholdUsdCents: number
  recentDepositWindowDays: number
}
