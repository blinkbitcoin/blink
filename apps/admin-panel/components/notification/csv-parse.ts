// blink validates every userId against KratosUserIdRegex (= UuidRegex,
// core/api/src/domain/shared/validation.ts). We mirror it here and drop bad rows
// client-side: the mutation rejects the ENTIRE batch on the first invalid id, so
// a stray header line or blank cell would otherwise fail a whole 1,000-user batch.
export const USER_ID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

// The admin GraphQL API parses request bodies with express.json()'s default
// 100 kB limit. A userId is ~40 bytes inside the JSON array, so we keep each
// mutation call to CHUNK_SIZE ids (well under the limit, leaving room for the
// notification content payload) and loop over the batches.
export const CHUNK_SIZE = 1000

export const chunk = <T>(arr: T[], size: number): T[][] => {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size))
  }
  return out
}

export type ParseSummary = {
  fileName: string
  totalRows: number
  validUnique: number
  duplicates: number
  invalid: number
}

export type ParseResult = {
  userIds: string[]
  summary: ParseSummary
}

// Split on commas, semicolons and any whitespace so a one-per-line list, a single
// CSV column, or a comma-separated row all work. Strip wrapping quotes, then keep
// only valid, unique user IDs — tracking how many rows were duplicates or invalid.
export const parseUserIdsCsv = (text: string, fileName: string): ParseResult => {
  const tokens = text
    .split(/[\s,;]+/)
    .map((token) => token.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean)

  const seen = new Set<string>()
  const valid: string[] = []
  let duplicates = 0
  let invalid = 0

  for (const token of tokens) {
    if (!USER_ID_REGEX.test(token)) {
      invalid++
      continue
    }
    if (seen.has(token)) {
      duplicates++
      continue
    }
    seen.add(token)
    valid.push(token)
  }

  return {
    userIds: valid,
    summary: {
      fileName,
      totalRows: tokens.length,
      validUnique: valid.length,
      duplicates,
      invalid,
    },
  }
}
