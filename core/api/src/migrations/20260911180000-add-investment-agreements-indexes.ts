/* eslint @typescript-eslint/ban-ts-comment: "off" */
// @ts-nocheck
module.exports = {
  async up(db) {
    const investmentAgreements = db.collection("investmentagreements")

    await investmentAgreements.createIndex({ id: 1 }, { unique: true })
    await investmentAgreements.createIndex({ envelopeId: 1 }, { unique: true })
    await investmentAgreements.createIndex({ accountId: 1, createdAt: -1 })

    console.log(
      "Created indexes on investmentagreements (id, envelopeId, accountId + createdAt)",
    )
  },
}
