// @ts-nocheck
const { randomUUID: generateUUID } = require("crypto")

const BATCH_SIZE = 1000

module.exports = {
  async up(db) {
    console.log("Starting contact migration to collection...")
    const accountsCursor = db.collection("accounts")
      .find({ contacts: { $exists: true, $not: { $size: 0 } } })
      .batchSize(BATCH_SIZE)

    let migratedCount = 0
    let failedAccounts = []

    while (await accountsCursor.hasNext()) {
      const contactInserts = []

      for (let i = 0; i < BATCH_SIZE && await accountsCursor.hasNext(); i++) {
        const account = await accountsCursor.next()
        const accountId = account.id
        const contacts = account.contacts || []

        try {
          for (const contact of contacts) {
            contactInserts.push({
              _id: contact._id,
              id: generateUUID(),
              accountId,
              type: "intraledger",
              handle: contact.id,
              displayName: contact.name,
              transactionsCount: contact.transactionsCount,
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
        if (contactInserts.length > 0) {
          await db.collection("contacts").insertMany(contactInserts)
        }

        migratedCount += contactInserts.length
        console.log(`Migrated ${migratedCount} contacts so far`)
      } catch (error) {
        console.error("Batch failed:", error)
        failedAccounts.push(...contactInserts.map(c => c.accountId))
      }
    }

    console.log(`Migration completed. Total contacts migrated: ${migratedCount}`)
    if (failedAccounts.length > 0) {
      console.warn("Some accounts failed to migrate:", failedAccounts)
    }
  },

  down() {
    return true
  },
}
