import { createHash } from "crypto"

import * as ecc from "tiny-secp256k1"

import {
  buildMigrationProofChallenge,
  checkedToSparkPubkey,
  MIGRATION_PROOF_FRESHNESS_WINDOW_SECONDS,
  MigrationInvalidDestinationError,
  MigrationProofExpiredError,
  verifyMigrationProofOfPossession,
} from "@/domain/migration-flow"

const sha256 = (data: Buffer) => createHash("sha256").update(data).digest()

const nowInSeconds = () => Math.floor(Date.now() / 1000)

const privateKey = Buffer.alloc(32, 7)
const otherPrivateKey = Buffer.alloc(32, 11)

const xOnlyPubkey = Buffer.from(ecc.xOnlyPointFromScalar(privateKey)).toString(
  "hex",
) as SparkPubkey
const compressedPubkey = Buffer.from(
  ecc.pointFromScalar(privateKey, true) as Uint8Array,
).toString("hex") as SparkPubkey
const otherCompressedPubkey = Buffer.from(
  ecc.pointFromScalar(otherPrivateKey, true) as Uint8Array,
).toString("hex") as SparkPubkey

const accountId = "account-id" as AccountId

const challengeDigest = ({
  destinationPubkey,
  timestamp,
}: {
  destinationPubkey: SparkPubkey
  timestamp: number
}) =>
  sha256(
    Buffer.from(
      buildMigrationProofChallenge({ accountId, destinationPubkey, timestamp }),
      "utf8",
    ),
  )

const signEcdsaCompactProof = ({
  destinationPubkey,
  timestamp,
  key = privateKey,
}: {
  destinationPubkey: SparkPubkey
  timestamp: number
  key?: Buffer
}) =>
  Buffer.from(ecc.sign(challengeDigest({ destinationPubkey, timestamp }), key)).toString(
    "hex",
  )

const derEncodeInteger = (bytes: Buffer): Buffer => {
  let i = 0
  while (i < bytes.length - 1 && bytes[i] === 0x00) i++
  let value = bytes.subarray(i)
  if (value[0] & 0x80) value = Buffer.concat([Buffer.from([0x00]), value])
  return Buffer.concat([Buffer.from([0x02, value.length]), value])
}

const derEncode = (compact: Buffer): Buffer => {
  const body = Buffer.concat([
    derEncodeInteger(compact.subarray(0, 32)),
    derEncodeInteger(compact.subarray(32, 64)),
  ])
  return Buffer.concat([Buffer.from([0x30, body.length]), body])
}

const rawDer = (r: Buffer, s: Buffer, trailing: Buffer = Buffer.alloc(0)): string => {
  const body = Buffer.concat([
    Buffer.from([0x02, r.length]),
    r,
    Buffer.from([0x02, s.length]),
    s,
    trailing,
  ])
  return Buffer.concat([Buffer.from([0x30, body.length]), body]).toString("hex")
}

const signEcdsaDerProof = ({
  destinationPubkey,
  timestamp,
  key = privateKey,
}: {
  destinationPubkey: SparkPubkey
  timestamp: number
  key?: Buffer
}) =>
  derEncode(
    Buffer.from(ecc.sign(challengeDigest({ destinationPubkey, timestamp }), key)),
  ).toString("hex")

const findEcdsaSignature = (
  predicate: (compact: Buffer) => boolean,
): { destinationPubkey: SparkPubkey; timestamp: number; compact: Buffer } => {
  const timestamp = nowInSeconds()
  for (let i = 1; i < 100000; i++) {
    const key = Buffer.alloc(32)
    key.writeUInt32BE(i, 28)
    if (!ecc.isPrivate(key)) continue
    const destinationPubkey = Buffer.from(
      ecc.pointFromScalar(key, true) as Uint8Array,
    ).toString("hex") as SparkPubkey
    const compact = Buffer.from(
      ecc.sign(challengeDigest({ destinationPubkey, timestamp }), key),
    )
    if (predicate(compact)) return { destinationPubkey, timestamp, compact }
  }
  throw new Error("no matching signature found")
}

describe("buildMigrationProofChallenge", () => {
  it("is domain-separated and binds account, destination and timestamp", () => {
    const challenge = buildMigrationProofChallenge({
      accountId,
      destinationPubkey: compressedPubkey,
      timestamp: 1234,
    })
    expect(challenge).toBe(`migrate:${accountId}-${compressedPubkey}-1234`)
  })
})

describe("verifyMigrationProofOfPossession", () => {
  it("rejects a 32-byte x-only pubkey — the SDK only emits compressed keys", () => {
    const timestamp = nowInSeconds()
    const result = verifyMigrationProofOfPossession({
      accountId,
      destinationPubkey: xOnlyPubkey,
      signature: signEcdsaCompactProof({ destinationPubkey: xOnlyPubkey, timestamp }),
      timestamp,
    })
    expect(result).toBeInstanceOf(MigrationInvalidDestinationError)
  })

  it("verifies a compact ecdsa signature for a 33-byte compressed pubkey", () => {
    const timestamp = nowInSeconds()
    const result = verifyMigrationProofOfPossession({
      accountId,
      destinationPubkey: compressedPubkey,
      signature: signEcdsaCompactProof({
        destinationPubkey: compressedPubkey,
        timestamp,
      }),
      timestamp,
    })
    expect(result).toBe(true)
  })

  it("verifies a DER-encoded ecdsa signature for a 33-byte compressed pubkey", () => {
    const timestamp = nowInSeconds()
    const result = verifyMigrationProofOfPossession({
      accountId,
      destinationPubkey: compressedPubkey,
      signature: signEcdsaDerProof({ destinationPubkey: compressedPubkey, timestamp }),
      timestamp,
    })
    expect(result).toBe(true)
  })

  it("rejects a well-formed DER signature made by the wrong key", () => {
    const timestamp = nowInSeconds()
    const result = verifyMigrationProofOfPossession({
      accountId,
      destinationPubkey: compressedPubkey,
      signature: signEcdsaDerProof({
        destinationPubkey: compressedPubkey,
        timestamp,
        key: otherPrivateKey,
      }),
      timestamp,
    })
    expect(result).toBeInstanceOf(MigrationInvalidDestinationError)
  })

  it("verifies a DER signature whose INTEGER carries a legal leading zero", () => {
    const { destinationPubkey, timestamp, compact } = findEcdsaSignature(
      (c) => (c[0] & 0x80) !== 0,
    )
    const der = derEncode(compact)
    expect(der[4]).toBe(0x00)
    expect(der[5] & 0x80).not.toBe(0)
    const result = verifyMigrationProofOfPossession({
      accountId,
      destinationPubkey,
      signature: der.toString("hex"),
      timestamp,
    })
    expect(result).toBe(true)
  })

  it("verifies a DER signature whose INTEGER is shorter than 32 bytes (left-padded)", () => {
    const { destinationPubkey, timestamp, compact } = findEcdsaSignature(
      (c) => c[0] === 0x00 && (c[1] & 0x80) === 0,
    )
    const der = derEncode(compact)
    expect(der[3]).toBeLessThan(32)
    const result = verifyMigrationProofOfPossession({
      accountId,
      destinationPubkey,
      signature: der.toString("hex"),
      timestamp,
    })
    expect(result).toBe(true)
  })

  it("rejects a tampered signature", () => {
    const timestamp = nowInSeconds()
    const signature = signEcdsaCompactProof({
      destinationPubkey: compressedPubkey,
      timestamp,
    })
    const tampered = (signature.slice(0, 1) === "0" ? "1" : "0") + signature.slice(1)

    const result = verifyMigrationProofOfPossession({
      accountId,
      destinationPubkey: compressedPubkey,
      signature: tampered,
      timestamp,
    })
    expect(result).toBeInstanceOf(MigrationInvalidDestinationError)
  })

  it("rejects a signature made by a different key", () => {
    const timestamp = nowInSeconds()
    const result = verifyMigrationProofOfPossession({
      accountId,
      destinationPubkey: otherCompressedPubkey,
      signature: signEcdsaCompactProof({
        destinationPubkey: otherCompressedPubkey,
        timestamp,
        key: privateKey,
      }),
      timestamp,
    })
    expect(result).toBeInstanceOf(MigrationInvalidDestinationError)
  })

  it("rejects a signature over a challenge for a different destination", () => {
    const timestamp = nowInSeconds()
    const result = verifyMigrationProofOfPossession({
      accountId,
      destinationPubkey: compressedPubkey,
      signature: signEcdsaCompactProof({
        destinationPubkey: otherCompressedPubkey,
        timestamp,
      }),
      timestamp,
    })
    expect(result).toBeInstanceOf(MigrationInvalidDestinationError)
  })

  it("rejects a truncated DER signature", () => {
    const timestamp = nowInSeconds()
    const der = signEcdsaDerProof({ destinationPubkey: compressedPubkey, timestamp })
    const result = verifyMigrationProofOfPossession({
      accountId,
      destinationPubkey: compressedPubkey,
      signature: der.slice(0, der.length - 4),
      timestamp,
    })
    expect(result).toBeInstanceOf(MigrationInvalidDestinationError)
  })

  it("rejects a garbage DER signature", () => {
    const timestamp = nowInSeconds()
    const result = verifyMigrationProofOfPossession({
      accountId,
      destinationPubkey: compressedPubkey,
      signature: "ff".repeat(70),
      timestamp,
    })
    expect(result).toBeInstanceOf(MigrationInvalidDestinationError)
  })

  it("rejects a DER signature with trailing bytes inside the sequence", () => {
    const timestamp = nowInSeconds()
    const signature = rawDer(
      Buffer.alloc(32, 0x11),
      Buffer.alloc(32, 0x22),
      Buffer.from([0x00, 0x00]),
    )
    const result = verifyMigrationProofOfPossession({
      accountId,
      destinationPubkey: compressedPubkey,
      signature,
      timestamp,
    })
    expect(result).toBeInstanceOf(MigrationInvalidDestinationError)
  })

  it("rejects a DER INTEGER with a superfluous leading zero", () => {
    const timestamp = nowInSeconds()
    const signature = rawDer(
      Buffer.concat([Buffer.from([0x00, 0x01]), Buffer.alloc(30, 0x11)]),
      Buffer.alloc(32, 0x22),
    )
    const result = verifyMigrationProofOfPossession({
      accountId,
      destinationPubkey: compressedPubkey,
      signature,
      timestamp,
    })
    expect(result).toBeInstanceOf(MigrationInvalidDestinationError)
  })

  it("rejects a stale timestamp outside the freshness window", () => {
    const timestamp = nowInSeconds() - MIGRATION_PROOF_FRESHNESS_WINDOW_SECONDS - 5
    const result = verifyMigrationProofOfPossession({
      accountId,
      destinationPubkey: compressedPubkey,
      signature: signEcdsaCompactProof({
        destinationPubkey: compressedPubkey,
        timestamp,
      }),
      timestamp,
    })
    expect(result).toBeInstanceOf(MigrationProofExpiredError)
  })

  it("rejects a future timestamp outside the freshness window", () => {
    const timestamp = nowInSeconds() + MIGRATION_PROOF_FRESHNESS_WINDOW_SECONDS + 5
    const result = verifyMigrationProofOfPossession({
      accountId,
      destinationPubkey: compressedPubkey,
      signature: signEcdsaCompactProof({
        destinationPubkey: compressedPubkey,
        timestamp,
      }),
      timestamp,
    })
    expect(result).toBeInstanceOf(MigrationProofExpiredError)
  })

  it("accepts a timestamp just inside the 600s freshness window", () => {
    const timestamp = nowInSeconds() - (MIGRATION_PROOF_FRESHNESS_WINDOW_SECONDS - 1)
    const result = verifyMigrationProofOfPossession({
      accountId,
      destinationPubkey: compressedPubkey,
      signature: signEcdsaCompactProof({
        destinationPubkey: compressedPubkey,
        timestamp,
      }),
      timestamp,
    })
    expect(result).toBe(true)
  })

  it("rejects a timestamp just outside the 600s freshness window", () => {
    const timestamp = nowInSeconds() - (MIGRATION_PROOF_FRESHNESS_WINDOW_SECONDS + 1)
    const result = verifyMigrationProofOfPossession({
      accountId,
      destinationPubkey: compressedPubkey,
      signature: signEcdsaCompactProof({
        destinationPubkey: compressedPubkey,
        timestamp,
      }),
      timestamp,
    })
    expect(result).toBeInstanceOf(MigrationProofExpiredError)
  })

  it("rejects a millisecond-valued timestamp as stale", () => {
    const timestamp = Date.now()
    const result = verifyMigrationProofOfPossession({
      accountId,
      destinationPubkey: compressedPubkey,
      signature: signEcdsaCompactProof({
        destinationPubkey: compressedPubkey,
        timestamp,
      }),
      timestamp,
    })
    expect(result).toBeInstanceOf(MigrationProofExpiredError)
  })

  it("accepts a timestamp just inside a custom freshness window", () => {
    const timestamp = nowInSeconds() - 1
    const result = verifyMigrationProofOfPossession({
      accountId,
      destinationPubkey: compressedPubkey,
      signature: signEcdsaCompactProof({
        destinationPubkey: compressedPubkey,
        timestamp,
      }),
      timestamp,
      freshnessWindowSeconds: 2 as Seconds,
    })
    expect(result).toBe(true)
  })

  it("rejects a timestamp outside a custom freshness window", () => {
    const timestamp = nowInSeconds() - 3
    const result = verifyMigrationProofOfPossession({
      accountId,
      destinationPubkey: compressedPubkey,
      signature: signEcdsaCompactProof({
        destinationPubkey: compressedPubkey,
        timestamp,
      }),
      timestamp,
      freshnessWindowSeconds: 2 as Seconds,
    })
    expect(result).toBeInstanceOf(MigrationProofExpiredError)
  })

  it("rejects a non-hex signature", () => {
    const result = verifyMigrationProofOfPossession({
      accountId,
      destinationPubkey: compressedPubkey,
      signature: "not-hex-at-all",
      timestamp: nowInSeconds(),
    })
    expect(result).toBeInstanceOf(MigrationInvalidDestinationError)
  })

  it("rejects a truncated signature", () => {
    const timestamp = nowInSeconds()
    const signature = signEcdsaCompactProof({
      destinationPubkey: compressedPubkey,
      timestamp,
    })
    const result = verifyMigrationProofOfPossession({
      accountId,
      destinationPubkey: compressedPubkey,
      signature: signature.slice(0, 32),
      timestamp,
    })
    expect(result).toBeInstanceOf(MigrationInvalidDestinationError)
  })

  it("rejects an unsupported pubkey length", () => {
    const timestamp = nowInSeconds()
    const result = verifyMigrationProofOfPossession({
      accountId,
      destinationPubkey: "abcd" as SparkPubkey,
      signature: signEcdsaCompactProof({
        destinationPubkey: "abcd" as SparkPubkey,
        timestamp,
      }),
      timestamp,
    })
    expect(result).toBeInstanceOf(MigrationInvalidDestinationError)
  })
})

describe("checkedToSparkPubkey", () => {
  it("rejects a 32-byte x-only pubkey — the SDK only emits compressed keys", () => {
    expect(checkedToSparkPubkey(xOnlyPubkey)).toBeInstanceOf(
      MigrationInvalidDestinationError,
    )
  })

  it("accepts a valid 33-byte compressed pubkey", () => {
    expect(checkedToSparkPubkey(compressedPubkey)).toBe(compressedPubkey)
  })

  it("rejects non-hex input", () => {
    expect(checkedToSparkPubkey("zz".repeat(32))).toBeInstanceOf(
      MigrationInvalidDestinationError,
    )
  })

  it("rejects a wrong-length key", () => {
    expect(checkedToSparkPubkey("ab".repeat(20))).toBeInstanceOf(
      MigrationInvalidDestinationError,
    )
  })

  it("rejects an odd-length 65-char hex key instead of truncating a nibble", () => {
    expect(checkedToSparkPubkey(`${xOnlyPubkey}a`)).toBeInstanceOf(
      MigrationInvalidDestinationError,
    )
  })

  it("rejects an odd-length 63-char hex key", () => {
    expect(checkedToSparkPubkey(xOnlyPubkey.slice(0, 63))).toBeInstanceOf(
      MigrationInvalidDestinationError,
    )
  })

  it("rejects 32 bytes that are not a point on the curve", () => {
    expect(checkedToSparkPubkey("00".repeat(32))).toBeInstanceOf(
      MigrationInvalidDestinationError,
    )
  })

  it("rejects 33 bytes with an invalid prefix", () => {
    expect(checkedToSparkPubkey(`05${xOnlyPubkey}`)).toBeInstanceOf(
      MigrationInvalidDestinationError,
    )
  })
})
