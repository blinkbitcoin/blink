type LnurlServerWallet = "btc" | "usd"

type LnurlServerProvider = "blink" | "spark"

type LnurlServerIdentifierKind = "username" | "phone"

type LnurlServerServiceError = import("./errors").LnurlServerServiceError

type LnurlServerCreateBlinkAccountArgs = {
  domain: string
  blinkAccountId: AccountId
  btcWalletId: WalletId
  usdWalletId: WalletId
  defaultWallet: LnurlServerWallet
  description: string
  identifiers: string[]
}

type LnurlServerAccountIdentifier = {
  identifier: string
  kind: LnurlServerIdentifierKind
  description: string
}

type LnurlServerBlinkAccount = {
  accountId: string
  provider: Extract<LnurlServerProvider, "blink">
  blinkAccountId: AccountId
  btcWalletId: WalletId
  usdWalletId: WalletId
  defaultWallet: LnurlServerWallet
  domain: string
  identifiers: LnurlServerAccountIdentifier[]
}

type LnurlServerUpdateDefaultWalletArgs = {
  accountId: AccountId
  defaultWallet: LnurlServerWallet
}

type LnurlServerUpdatedDefaultWallet = {
  accountId: string
  provider: Extract<LnurlServerProvider, "blink">
  blinkAccountId: AccountId
  defaultWallet: LnurlServerWallet
}

type LnurlServerGetIdentifierArgs = {
  domain: string
  identifier: string
}

type LnurlServerIdentifierProviderDetails = {
  sparkPubkey?: string | null
  blinkAccountId?: AccountId | null
  btcWalletId?: WalletId | null
  usdWalletId?: WalletId | null
  defaultWallet?: LnurlServerWallet | null
}

type LnurlServerIdentifier = {
  provider: LnurlServerProvider
  accountId: string
  domain: string
  identifier: string
  identifierKind: LnurlServerIdentifierKind
  description: string
  requestedWallet: LnurlServerWallet | null
  providerDetails: LnurlServerIdentifierProviderDetails
}

type LnurlServerTransferToSparkArgs = {
  domain: string
  identifier: string
  destinationSparkPubkey: string
  description: string
}

type LnurlServerTransferToSparkResult = {
  domain: string
  identifier: string
  provider: Extract<LnurlServerProvider, "spark">
  sparkPubkey: string
  lightningAddress: string
  lnurl: string
}

interface ILnurlServerService {
  createBlinkAccount(
    args: LnurlServerCreateBlinkAccountArgs,
  ): Promise<LnurlServerBlinkAccount | LnurlServerServiceError>

  updateDefaultWallet(
    args: LnurlServerUpdateDefaultWalletArgs,
  ): Promise<LnurlServerUpdatedDefaultWallet | LnurlServerServiceError>

  getIdentifier(
    args: LnurlServerGetIdentifierArgs,
  ): Promise<LnurlServerIdentifier | LnurlServerServiceError>

  transferIdentifierToSpark(
    args: LnurlServerTransferToSparkArgs,
  ): Promise<LnurlServerTransferToSparkResult | LnurlServerServiceError>
}
