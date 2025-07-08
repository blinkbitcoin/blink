module.exports = {
  // @ts-ignore-next-line no-implicit-any error
  async up(db) {
    await db.collection("merchants").updateMany({}, { $set: { deleted: false } })
  },

  // @ts-ignore-next-line no-implicit-any error
  async down(db) {
    await db.collection("merchants").updateMany({}, { $unset: { deleted: "" } })
  },
}
