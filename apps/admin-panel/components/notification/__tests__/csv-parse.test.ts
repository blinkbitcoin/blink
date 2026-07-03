import { CHUNK_SIZE, USER_ID_REGEX, chunk, parseUserIdsCsv } from "../csv-parse"

// Valid v1-v5 UUIDs (version nibble 1-5, variant nibble 8/9/a/b) — these are the
// only shapes blink's KratosUserIdRegex accepts.
const ID_A = "550e8400-e29b-41d4-a716-446655440000"
const ID_B = "f47ac10b-58cc-4372-a567-0e02b2c3d479"
const ID_C = "6ba7b810-9dad-11d1-80b4-00c04fd430c8"

describe("USER_ID_REGEX", () => {
  test("accepts well-formed UUIDs regardless of hex case", () => {
    expect(USER_ID_REGEX.test(ID_A)).toBe(true)
    expect(USER_ID_REGEX.test(ID_A.toUpperCase())).toBe(true)
  })

  test("rejects malformed ids and out-of-range version/variant nibbles", () => {
    expect(USER_ID_REGEX.test("not-a-uuid")).toBe(false)
    expect(USER_ID_REGEX.test("user_id")).toBe(false)
    expect(USER_ID_REGEX.test("550e8400-e29b-41d4-a716")).toBe(false) // too short
    expect(USER_ID_REGEX.test("g50e8400-e29b-41d4-a716-446655440000")).toBe(false) // non-hex
    expect(USER_ID_REGEX.test("00000000-0000-0000-0000-000000000000")).toBe(false) // v0
    expect(USER_ID_REGEX.test("550e8400-e29b-41d4-c716-446655440000")).toBe(false) // variant c
  })
})

describe("parseUserIdsCsv", () => {
  test("parses a one-per-line list", () => {
    const { userIds, summary } = parseUserIdsCsv(`${ID_A}\n${ID_B}\n${ID_C}`, "ids.txt")
    expect(userIds).toEqual([ID_A, ID_B, ID_C])
    expect(summary).toEqual({
      fileName: "ids.txt",
      totalRows: 3,
      validUnique: 3,
      duplicates: 0,
      invalid: 0,
    })
  })

  test("parses comma- and semicolon-separated values", () => {
    expect(parseUserIdsCsv(`${ID_A},${ID_B}`, "f").userIds).toEqual([ID_A, ID_B])
    expect(parseUserIdsCsv(`${ID_A};${ID_B}`, "f").userIds).toEqual([ID_A, ID_B])
  })

  test("tolerates mixed whitespace, blank lines and trailing separators", () => {
    const { userIds } = parseUserIdsCsv(`\n  ${ID_A}\t\r\n\n${ID_B} ,\n`, "f")
    expect(userIds).toEqual([ID_A, ID_B])
  })

  test("strips single and double wrapping quotes", () => {
    const { userIds } = parseUserIdsCsv(`"${ID_A}"\n'${ID_B}'`, "f")
    expect(userIds).toEqual([ID_A, ID_B])
  })

  test("dedupes and counts duplicates while preserving first-seen order", () => {
    const { userIds, summary } = parseUserIdsCsv(`${ID_B}\n${ID_A}\n${ID_B}`, "f")
    expect(userIds).toEqual([ID_B, ID_A])
    expect(summary.validUnique).toBe(2)
    expect(summary.duplicates).toBe(1)
    expect(summary.totalRows).toBe(3)
  })

  test("counts invalid rows (e.g. a header line or non-uuid cell) as skipped", () => {
    const { userIds, summary } = parseUserIdsCsv(`user_id\n${ID_A}\ngarbage`, "f")
    expect(userIds).toEqual([ID_A])
    expect(summary.invalid).toBe(2)
    expect(summary.validUnique).toBe(1)
  })

  test("splits a multi-column CSV row and drops the non-id column", () => {
    const { userIds, summary } = parseUserIdsCsv(
      `${ID_A},alice@example.com\n${ID_B},bob@example.com`,
      "f",
    )
    expect(userIds).toEqual([ID_A, ID_B])
    expect(summary.invalid).toBe(2) // the two email cells
  })

  test("strips a leading UTF-8 BOM instead of invalidating the first id", () => {
    const { userIds, summary } = parseUserIdsCsv(`\ufeff${ID_A}\n${ID_B}`, "f")
    expect(userIds).toEqual([ID_A, ID_B])
    expect(summary.invalid).toBe(0)
  })

  test("returns an empty result for empty or whitespace-only input", () => {
    const { userIds, summary } = parseUserIdsCsv("\n  \t\n", "empty.csv")
    expect(userIds).toEqual([])
    expect(summary).toEqual({
      fileName: "empty.csv",
      totalRows: 0,
      validUnique: 0,
      duplicates: 0,
      invalid: 0,
    })
  })
})

describe("chunk", () => {
  test("splits into batches of the given size with a partial final batch", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })

  test("splits evenly when the length is a multiple of the size", () => {
    expect(chunk([1, 2, 3, 4], 2)).toEqual([
      [1, 2],
      [3, 4],
    ])
  })

  test("returns a single batch when the size exceeds the length", () => {
    expect(chunk([1, 2, 3], 10)).toEqual([[1, 2, 3]])
  })

  test("returns no batches for an empty array", () => {
    expect(chunk([], CHUNK_SIZE)).toEqual([])
  })

  test("respects the CHUNK_SIZE boundary the sender relies on", () => {
    const ids = Array.from({ length: CHUNK_SIZE + 1 }, (_, i) => i)
    const batches = chunk(ids, CHUNK_SIZE)
    expect(batches).toHaveLength(2)
    expect(batches[0]).toHaveLength(CHUNK_SIZE)
    expect(batches[1]).toHaveLength(1)
  })
})
