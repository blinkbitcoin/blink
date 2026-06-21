type LnurlServerCreateBlinkAccountRequestRaw = {
  domain: string
  blink_account_id: AccountId
  btc_wallet_id: WalletId
  usd_wallet_id: WalletId
  default_wallet: LnurlServerWallet
  description: string
  identifiers: string[]
}

type LnurlServerCreateBlinkAccountRaw = {
  account_id: string
  provider: "blink"
  blink_account_id: AccountId
  btc_wallet_id: WalletId
  usd_wallet_id: WalletId
  default_wallet: LnurlServerWallet
  domain: string
  identifiers: LnurlServerAccountIdentifier[]
}

type LnurlServerUpdateBlinkAccountDefaultWalletRequestRaw = {
  default_wallet: LnurlServerWallet
}

type LnurlServerUpdatedDefaultWalletRaw = {
  account_id: string
  provider: "blink"
  blink_account_id: AccountId
  default_wallet: LnurlServerWallet
}

type LnurlServerIdentifierRaw = {
  provider: LnurlServerProvider
  account_id: string
  domain: string
  identifier: string
  identifier_kind: LnurlServerIdentifierKind
  description: string
  requested_wallet: LnurlServerWallet | null
  provider_details: {
    spark_pubkey?: string | null
    blink_account_id?: AccountId | null
    btc_wallet_id?: WalletId | null
    usd_wallet_id?: WalletId | null
    default_wallet?: LnurlServerWallet | null
  }
}

type LnurlServerTransferToSparkRequestRaw = {
  domain: string
  identifier: string
  destination_spark_pubkey: string
  description: string
}

type LnurlServerTransferToSparkResultRaw = {
  domain: string
  identifier: string
  provider: "spark"
  spark_pubkey: string
  lightning_address: string
  lnurl: string
}
