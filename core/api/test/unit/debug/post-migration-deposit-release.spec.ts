jest.mock("@/app/migration-flow/post-migration-deposit-release", () => ({}))
jest.mock("@/services/mongodb", () => ({ setupMongoConnection: jest.fn() }))

import { parseOutput, steps } from "@/debug/post-migration-deposit-release"

describe("post-migration deposit release CLI", () => {
  const txid = "ab".repeat(32)

  it("exposes only the four recovery steps", () => {
    expect(steps).toEqual(["inspect", "prepare", "release", "reconcile"])
  })

  it("parses and normalizes an exact output", () => {
    expect(parseOutput(txid.toUpperCase(), "7")).toEqual({
      txHash: txid,
      vout: 7,
    })
  })

  it.each([
    [undefined, "0"],
    ["not-a-txid", "0"],
    [txid, undefined],
    [txid, "-1"],
    [txid, "1.5"],
  ])("rejects invalid output %s:%s", (hash, vout) => {
    expect(parseOutput(hash, vout)).toBeInstanceOf(Error)
  })
})
