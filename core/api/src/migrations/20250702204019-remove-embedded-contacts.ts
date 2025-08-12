// @ts-nocheck
module.exports = {
  async up(db) {
    console.log("Removing embedded contacts from accounts...")

    const result = await db.collection("accounts").updateMany(
      {},
      { $unset: { contacts: "" } }
    )

    console.log(`Unset contacts field in ${result.modifiedCount} accounts`)
  },

  async down() {
    return true
  },
}
