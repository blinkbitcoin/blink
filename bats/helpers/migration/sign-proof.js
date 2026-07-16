#!/usr/bin/env node
// Signs the migration proof-of-possession challenge with a fixed test keypair.
// Usage: sign-proof.js <accountId> [timestamp]

const crypto = require("crypto")

const accountId = process.argv[2]
const timestamp = Number(process.argv[3] ?? Math.floor(Date.now() / 1000))
if (!accountId) {
  console.error("usage: sign-proof.js <accountId> [timestamp]")
  process.exit(1)
}

const privateKey = Buffer.alloc(32, 7)
const ecdh = crypto.createECDH("secp256k1")
ecdh.setPrivateKey(privateKey)
const uncompressed = ecdh.getPublicKey()
const sparkPubkey = ecdh.getPublicKey(null, "compressed").toString("hex")

const b64u = (buf) => buf.toString("base64url")
const key = crypto.createPrivateKey({
  key: {
    kty: "EC",
    crv: "secp256k1",
    d: b64u(privateKey),
    x: b64u(uncompressed.subarray(1, 33)),
    y: b64u(uncompressed.subarray(33, 65)),
  },
  format: "jwk",
})

const challenge = `migrate:${accountId}-${sparkPubkey}-${timestamp}`
const proofSignature = crypto
  .sign("sha256", Buffer.from(challenge, "utf8"), { key, dsaEncoding: "ieee-p1363" })
  .toString("hex")

console.log(JSON.stringify({ sparkPubkey, proofSignature, proofTimestamp: timestamp }))
