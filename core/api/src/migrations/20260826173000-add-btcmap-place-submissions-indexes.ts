/* eslint @typescript-eslint/ban-ts-comment: "off" */
// @ts-nocheck
module.exports = {
  async up(db) {
    await db
      .collection("btcmapplacesubmissions")
      .createIndex({ submissionId: 1 }, { unique: true })

    console.log("Created unique index on btcmapplacesubmissions (submissionId)")
  },
}
