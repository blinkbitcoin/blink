/**
 * how to run:
 *
 * pnpm tsx src/debug/force-delete-account.ts <account id>
 *
 * <account id>: ID of the account to force delete (bypasses max deletions limit)
 */

import { Accounts } from "@/app"

import { setupMongoConnection } from "@/services/mongodb"

const main = async () => {
  const args = process.argv.slice(-1)
  const accountId = args[0] as AccountId

  const result = await Accounts.markAccountForDeletion({
    accountId,
    cancelIfPositiveBalance: true,
    bypassMaxDeletions: true,
    updatedByPrivilegedClientId: "admin" as PrivilegedClientId,
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
