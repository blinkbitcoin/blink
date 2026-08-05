type SkipFeeProbeConfig = { pubkey: Pubkey[]; chanId: ChanId[] }

type CustodialMigrationFlowConfig = {
  enabled: boolean
  deMinimisThresholdSats: number
}
