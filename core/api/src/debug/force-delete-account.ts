/**
 * how to run:
 *
 * pnpm tsx src/debug/force-delete-account.ts <account id> [destination account id]
 *
 * <account id>: ID of the account to force delete (bypasses max deletions limit)
 * [destination account id]: optional account to sweep remaining balance to before deletion
 */

import { Accounts } from "@/app"

import { setupMongoConnection } from "@/services/mongodb"

const main = async () => {
  const args = process.argv.slice(-2)
  const accountId = args[0] as AccountId
  const destinationAccountId = args[1] as AccountId | undefined

  const result = await Accounts.markAccountForDeletion({
    accountId,
    skipChecks: true,
    bypassMaxDeletions: true,
    updatedByPrivilegedClientId: "admin" as PrivilegedClientId,
    destinationAccountId,
  })

  if (result instanceof Error) {
    console.error("Error:", result)
    return
  }
  console.log(`Successfully force deleted account ${accountId}`)
}

setupMongoConnection()
  .then(async (mongoose) => {
    await main()
    if (mongoose) await mongoose.connection.close()
  })
  .catch((err) => console.log(err))
