/**
 * how to run:
 *
 * pnpm tsx src/debug/transfer-profit.ts <role> <amount> <description>
 *
 * <role>: bankowner | dealer
 * <amount>: amount in sats
 * <description>: memo used for the intraledger payment
 */

import { Payments } from "@/app"
import { getWalletFromAccount } from "@/app/accounts/get-wallet-from-account"
import { checkedToUsername } from "@/domain/accounts"
import { checkedToSats } from "@/domain/bitcoin"
import { WalletCurrency } from "@/domain/shared"
import { setupMongoConnection } from "@/services/mongodb"
import { AccountsRepository } from "@/services/mongoose"
import { Account as AccountModel } from "@/services/mongoose/schema"

const recipientUsername = "globalprofit"
const supportedRoles = ["bankowner", "dealer"] as const

type ProfitTransferRole = (typeof supportedRoles)[number]

const parseProfitTransferArgs = (
  args: string[],
): { role: ProfitTransferRole; amount: Satoshis; description: string } | Error => {
  const [roleRaw, amountRaw, ...descriptionParts] = args
  const description = descriptionParts.join(" ").trim()

  if (!roleRaw || !supportedRoles.includes(roleRaw as ProfitTransferRole)) {
    return new Error(
      `Invalid role: ${roleRaw}. Expected one of: ${supportedRoles.join(", ")}`,
    )
  }

  const amountNumber = Number(amountRaw)
  const amount = checkedToSats(amountNumber)
  if (amount instanceof Error) return amount

  if (!description) return new Error("Missing description")

  return {
    role: roleRaw as ProfitTransferRole,
    amount,
    description,
  }
}

const getAccountByRole = async (role: ProfitTransferRole) => {
  const accountRecord = await AccountModel.findOne({ role }, { id: 1 })
  if (!accountRecord) return new Error(`Could not find account with role ${role}`)
  return AccountsRepository().findById(accountRecord.id as AccountId)
}

const transferProfits = async ({
  role,
  amount,
  description,
}: {
  role: ProfitTransferRole
  amount: Satoshis
  description: string
}) => {
  const senderAccount = await getAccountByRole(role)
  if (senderAccount instanceof Error) return senderAccount

  const validatedRecipientUsername = checkedToUsername(recipientUsername)
  if (validatedRecipientUsername instanceof Error) return validatedRecipientUsername

  const recipientAccount = await AccountsRepository().findByUsername(
    validatedRecipientUsername,
  )
  if (recipientAccount instanceof Error) return recipientAccount

  const senderWallet = await getWalletFromAccount(senderAccount, WalletCurrency.Btc)
  if (senderWallet instanceof Error) return senderWallet

  const recipientWallet = await getWalletFromAccount(recipientAccount, WalletCurrency.Btc)
  if (recipientWallet instanceof Error) return recipientWallet

  return Payments.intraledgerPaymentSendWalletIdForBtcWallet({
    senderWalletId: senderWallet.id,
    senderAccount,
    recipientWalletId: recipientWallet.id,
    amount,
    memo: description,
  })
}

const main = async () => {
  const parsed = parseProfitTransferArgs(process.argv.slice(2))
  if (parsed instanceof Error) {
    console.error("Error:", parsed.message)
    process.exitCode = 1
    return
  }

  const result = await transferProfits(parsed)
  if (result instanceof Error) {
    console.error("Error:", result)
    process.exitCode = 1
    return
  }

  console.log(
    `Transferred ${parsed.amount} sats from ${parsed.role} to ${recipientUsername}`,
    result,
  )
}

if (require.main === module) {
  setupMongoConnection()
    .then(async (mongoose) => {
      await main()
      if (mongoose) await mongoose.connection.close()
    })
    .catch((err) => console.log(err))
}
