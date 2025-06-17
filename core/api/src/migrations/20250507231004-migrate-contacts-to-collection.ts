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
      const accountUpdates = []

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
              identifier: contact.id,
              alias: contact.name,
              transactionsCount: contact.transactionsCount,
              createdAt: new Date(),
            })
          }

          accountUpdates.push({
            updateOne: {
              filter: { _id: account._id },
              update: { $set: { contacts: [] } },
            },
          })
        } catch (error) {
          console.error("Error processing account:", accountId, error)
          failedAccounts.push(accountId)
        }
      }

      try {
        if (contactInserts.length > 0) {
          await db.collection("contacts").insertMany(contactInserts)
        }

        if (accountUpdates.length > 0) {
          await db.collection("accounts").bulkWrite(accountUpdates)
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

  async down(db) {
    console.log("Starting rollback of contacts migration...")

    const cursor = db.collection("contacts")
      .find()
      .batchSize(BATCH_SIZE)

    let processed = 0

    while (await cursor.hasNext()) {
      const accountUpdatesMap = {}

      for (let i = 0; i < BATCH_SIZE && await cursor.hasNext(); i++) {
        const contact = await cursor.next()
        const accountId = contact.accountId

        if (!accountUpdatesMap[accountId]) {
          accountUpdatesMap[accountId] = []
        }

        accountUpdatesMap[accountId].push({
          _id: contact._id,
          id: contact.identifier,
          name: contact.alias,
          transactionsCount: contact.transactionsCount || 1,
        })

        processed++
      }

      const bulkOps = Object.entries(accountUpdatesMap).map(([accountId, contacts]) => ({
        updateOne: {
          filter: { id: accountId },
          update: { $set: { contacts } },
        },
      }))

      try {
        if (bulkOps.length > 0) {
          await db.collection("accounts").bulkWrite(bulkOps)
          await db.collection("contacts").deleteMany({
            accountId: { $in: Object.keys(accountUpdatesMap) },
          })
        }

        console.log(`Restored contacts to ${bulkOps.length} accounts`)
      } catch (error) {
        console.error("Failed to restore contacts for some accounts", error)
      }
    }

    console.log(`Rollback completed. Total contacts processed: ${processed}`)
  },
}
