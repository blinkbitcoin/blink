/* eslint @typescript-eslint/ban-ts-comment: "off" */
// @ts-nocheck
const BATCH_SIZE = 1000

// handles are now trimmed and lowercased by checkedToHandle, so rows stored before that
// are unreachable by a lookup keyed on the normalized handle. the non-ascii branch is
// there because toLowerCase() folds characters this pattern cannot name
const NOT_NORMALIZED = /[A-Z]|[^\x00-\x7f]|^\s|\s$/

// folding into the contact that already holds the normalized handle is the only way to
// normalize this row without breaking the unique index on (accountId, handle, type)
const normalizeHandle = async (contacts, contact, normalizedHandle) => {
  const existing = await contacts.findOne({
    accountId: contact.accountId,
    handle: normalizedHandle,
    type: contact.type,
    _id: { $ne: contact._id },
  })

  if (existing) {
    await contacts.updateOne(
      { _id: existing._id },
      {
        $inc: { transactionsCount: contact.transactionsCount || 0 },
        $set: { updatedAt: new Date() },
      },
    )
    await contacts.deleteOne({ _id: contact._id })
    return true
  }

  await contacts.updateOne(
    { _id: contact._id },
    { $set: { handle: normalizedHandle, updatedAt: new Date() } },
  )
  return false
}

module.exports = {
  async up(db) {
    console.log("Starting contact handle normalization...")

    const contacts = db.collection("contacts")
    const cursor = contacts
      .find({ handle: { $regex: NOT_NORMALIZED } })
      .batchSize(BATCH_SIZE)

    let processedCount = 0
    let mergedCount = 0

    while (await cursor.hasNext()) {
      const contact = await cursor.next()
      if (!contact || typeof contact.handle !== "string") continue

      const normalizedHandle = contact.handle.trim().toLowerCase()
      if (normalizedHandle === contact.handle) continue

      try {
        const merged = await normalizeHandle(contacts, contact, normalizedHandle)
        if (merged) mergedCount++
      } catch (error) {
        console.error(`Failed to normalize handle for contact ${contact._id}`, error)
        continue
      }

      processedCount++
      if (processedCount % 500 === 0) {
        console.log(`${processedCount} contact handles processed`)
      }
    }

    console.log(
      `Finished contact handle normalization. Rewritten: ${
        processedCount - mergedCount
      }, merged into an existing contact: ${mergedCount}`,
    )
  },
}
