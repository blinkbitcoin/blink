import { WalletCurrency } from "@/domain/shared"

export * from "./errors"

export const lnurlWalletFromCurrency = (currency: WalletCurrency): LnurlServerWallet => {
  if (currency === WalletCurrency.Btc) {
    return "btc"
  }

  return "usd"
}
