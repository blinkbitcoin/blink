// @ts-nocheck
const BATCH_SIZE = 1000

module.exports = {
  async up(db) {
    console.log("Starting username migration to collection...")

    const accountsCursor = db.collection("accounts")
      .find({ username: { $type: "string" } })
      .batchSize(BATCH_SIZE)

    let migratedCount = 0
    let failedAccounts = []

    while (await accountsCursor.hasNext()) {
      const usernameInserts = []

      for (let i = 0; i < BATCH_SIZE && await accountsCursor.hasNext(); i++) {
        const account = await accountsCursor.next()
        const accountId = account.id
        const defaultWalletId = account.defaultWalletId
        const handle = account.username

        try {
          if (typeof handle === "string" && handle.length > 0) {
            usernameInserts.push({
              accountId,
              walletId: defaultWalletId,
              handle,
              isDefault: true,
              createdAt: new Date(),
              updatedAt: new Date(),
            })
          }
        } catch (error) {
          console.error("Error processing account:", accountId, error)
          failedAccounts.push(accountId)
        }
      }

      try {
        if (usernameInserts.length > 0) {
          await db.collection("usernames").insertMany(usernameInserts)
        }

        migratedCount += usernameInserts.length
        console.log(`Migrated ${migratedCount} usernames so far`)
      } catch (error) {
        console.error("Batch failed:", error)
        failedAccounts.push(...usernameInserts.map(u => u.accountId))
      }
    }

    console.log(`Migration completed. Total usernames migrated: ${migratedCount}`)
    if (failedAccounts.length > 0) {
      console.warn("Some accounts failed to migrate:", failedAccounts)
    }
  },

  down() {
    return true
  },
}
