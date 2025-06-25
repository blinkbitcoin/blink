module.exports = {
  // @ts-ignore-next-line no-implicit-any error
  async up(db) {
    console.log("Begin username prefix migration for invalid usernames")

    const cursor = db.collection("accounts").find({
      username: {
        $exists: true,
        $not: {
          $regex: "^(?![13_]|bc1|lnbc1)(?=.*[a-z])[0-9a-z_]{3,50}$",
          $options: "i",
        },
      },
    })

    let progress = 0

    while (await cursor.hasNext()) {
      const account = await cursor.next()
      if (!account) continue

      const oldUsername = account.username
      if (!oldUsername) continue

      const newUsername = oldUsername.startsWith("_")
        ? `user${oldUsername}`
        : `user_${oldUsername}`

      try {
        await db
          .collection("accounts")
          .updateOne({ _id: account._id }, { $set: { username: newUsername } })
      } catch (error) {
        console.error(`Failed to update username for account ${account._id}`, error)
      }

      progress++
      if (progress % 500 === 0) {
        console.log(`${progress} usernames updated`)
      }
    }

    console.log("Finished username prefix migration")
  },

  down() {
    return true
  },
}
