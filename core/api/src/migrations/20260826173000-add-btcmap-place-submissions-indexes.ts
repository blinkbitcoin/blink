/* eslint @typescript-eslint/ban-ts-comment: "off" */
// @ts-nocheck
module.exports = {
  async up(db) {
    await db
      .collection("btcmapplacesubmissions")
      .createIndex({ accountId: 1, submissionId: 1 }, { unique: true })

    console.log("Created unique index on btcmapplacesubmissions (accountId, submissionId)")
  },
}
