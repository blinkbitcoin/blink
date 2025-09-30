import { createMemo, getWalletDetails, isValidVoucherSecret } from "@/utils/helpers"
import { updateWithdrawLinkStatus, getWithdrawLinkBySecret } from "@/services/db"

import {
  RedeemWithdrawLinkOnChainResultStatus,
  PaymentSendResult,
  PayoutSpeed,
  Status,
} from "@/lib/graphql/generated"
import { lockVoucherSecret } from "@/services/lock"
import { fetchUserData } from "@/services/galoy/query/me"
import { escrowApolloClient } from "@/services/galoy/client/escrow"
import { onChainUsdTxFee } from "@/services/galoy/query/on-chain-usd-tx-fee"
import { onChainUsdPaymentSend } from "@/services/galoy/mutation/on-chain-payment-send"

export const redeemWithdrawLinkOnChain = async (
  _: undefined,
  args: {
    input: {
      voucherSecret: string
      onChainAddress: string
    }
  },
) => {
  const { voucherSecret, onChainAddress } = args.input
  if (!isValidVoucherSecret(voucherSecret)) {
    return new Error("Invalid voucher secret")
  }

  const escrowClient = escrowApolloClient()
  const escrowData = await fetchUserData({ client: escrowClient })

  if (escrowData instanceof Error) return escrowData
  if (!escrowData.me?.defaultAccount.wallets) {
    return new Error("Internal Server Error")
  }

  const { usdWallet: escrowUsdWallet } = getWalletDetails({
    wallets: escrowData.me?.defaultAccount.wallets,
  })
  if (!escrowUsdWallet || !escrowUsdWallet.id) return new Error("Internal Server Error")

  return lockVoucherSecret(voucherSecret, async () => {
    const withdrawLink = await getWithdrawLinkBySecret({
      voucherSecret,
    })
    if (withdrawLink instanceof Error) return withdrawLink

    if (!withdrawLink) {
      return new Error("Withdraw link not found")
    }

    if (withdrawLink.status === Status.Pending) {
      return new Error(
        "Withdrawal link is in pending state. Please contact support if the error persists.",
      )
    }

    if (withdrawLink.status === Status.Paid) {
      return new Error("Withdraw link claimed")
    }

    const onChainUsdTxFeeResponse = await onChainUsdTxFee({
      client: escrowClient,
      input: {
        address: onChainAddress,
        amount: withdrawLink.voucherAmountInCents,
        walletId: escrowUsdWallet?.id,
        speed: PayoutSpeed.Fast,
      },
    })

    if (onChainUsdTxFeeResponse instanceof Error) return onChainUsdTxFeeResponse
    const totalAmountToBePaid =
      withdrawLink.voucherAmountInCents - onChainUsdTxFeeResponse.onChainUsdTxFee.amount

    if (totalAmountToBePaid <= 0)
      return new Error("This Voucher Cannot Withdraw On Chain amount is less than fees")

    const response = await updateWithdrawLinkStatus({
      id: withdrawLink.id,
      status: Status.Paid,
    })

    if (response instanceof Error) return response

    const onChainUsdPaymentSendResponse = await onChainUsdPaymentSend({
      client: escrowClient,
      input: {
        address: onChainAddress,
        amount: totalAmountToBePaid,
        memo: createMemo({
          voucherAmountInCents: withdrawLink.voucherAmountInCents,
          commissionPercentage: withdrawLink.commissionPercentage,
          identifierCode: withdrawLink.identifierCode,
        }),
        speed: PayoutSpeed.Fast,
        walletId: escrowUsdWallet?.id,
      },
    })

    if (onChainUsdPaymentSendResponse instanceof Error) {
      await updateWithdrawLinkStatus({
        id: withdrawLink.id,
        status: Status.Active,
      })
      return onChainUsdPaymentSendResponse
    }

    if (onChainUsdPaymentSendResponse.onChainUsdPaymentSend.errors.length > 0) {
      await updateWithdrawLinkStatus({
        id: withdrawLink.id,
        status: Status.Active,
      })
      return new Error(
        onChainUsdPaymentSendResponse.onChainUsdPaymentSend.errors[0].message,
      )
    }

    if (
      onChainUsdPaymentSendResponse.onChainUsdPaymentSend.status !==
      PaymentSendResult.Success
    ) {
      await updateWithdrawLinkStatus({
        id: withdrawLink.id,
        status: Status.Active,
      })
      return new Error(
        `Transaction not successful got status ${onChainUsdPaymentSendResponse.onChainUsdPaymentSend.status}`,
      )
    }

    return {
      status: RedeemWithdrawLinkOnChainResultStatus.Success,
      message: "Payment successful",
    }
  })
}
