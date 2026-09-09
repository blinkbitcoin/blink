// migrations are plain commonjs scripts for migrate-mongo, so they are not importable
// as modules
const migration: { up: (db: { collection: () => unknown }) => Promise<void> } =
  jest.requireActual("@/migrations/20260908160000-normalize-contact-handles")

type ContactRow = {
  _id: string
  accountId: string
  type: string
  handle: string
  transactionsCount: number
  updatedAt?: Date
}

// the migration runs against the raw mongo driver, so the fake below implements only the
// operators it uses: a $regex find, a $ne guard on findOne, and $set/$inc on updateOne
const fakeContactsCollection = (rows: ContactRow[]) => {
  const matches = (row: ContactRow, query: Record<string, unknown>): boolean =>
    Object.entries(query).every(([field, condition]) => {
      const value = row[field as keyof ContactRow]
      if (condition instanceof RegExp) return condition.test(String(value))
      if (condition && typeof condition === "object") {
        const { $regex, $ne } = condition as { $regex?: RegExp; $ne?: unknown }
        if ($regex) return $regex.test(String(value))
        if ($ne !== undefined) return value !== $ne
      }
      return value === condition
    })

  return {
    rows,
    find: (query: Record<string, unknown>) => {
      const selected = rows.filter((row) => matches(row, query))
      let index = 0
      const cursor = {
        batchSize: () => cursor,
        hasNext: async () => index < selected.length,
        next: async () => selected[index++],
      }
      return cursor
    },
    findOne: async (query: Record<string, unknown>) =>
      rows.find((row) => matches(row, query)),
    updateOne: async (
      query: Record<string, unknown>,
      update: { $set?: Partial<ContactRow>; $inc?: { transactionsCount: number } },
    ) => {
      const row = rows.find((candidate) => matches(candidate, query))
      if (!row) return
      Object.assign(row, update.$set)
      if (update.$inc) row.transactionsCount += update.$inc.transactionsCount
    },
    deleteOne: async (query: Record<string, unknown>) => {
      const index = rows.findIndex((row) => matches(row, query))
      if (index >= 0) rows.splice(index, 1)
    },
  }
}

const contactRow = (overrides: Partial<ContactRow>): ContactRow => ({
  _id: "id",
  accountId: "account-id",
  type: "lnaddress",
  handle: "alice@blink.sv",
  transactionsCount: 1,
  ...overrides,
})

const runMigration = async (rows: ContactRow[]) => {
  const contacts = fakeContactsCollection(rows)
  await migration.up({ collection: () => contacts })
  return contacts.rows
}

beforeAll(() => {
  jest.spyOn(console, "log").mockImplementation(() => undefined)
  jest.spyOn(console, "error").mockImplementation(() => undefined)
})

afterAll(() => {
  jest.restoreAllMocks()
})

describe("normalize-contact-handles migration", () => {
  it("lowercases a handle stored with uppercase", async () => {
    const rows = await runMigration([contactRow({ _id: "a", handle: "Alice@Blink.SV" })])

    expect(rows).toHaveLength(1)
    expect(rows[0]).toHaveProperty("handle", "alice@blink.sv")
  })

  it("stamps updatedAt on a rewritten handle", async () => {
    const rows = await runMigration([contactRow({ _id: "a", handle: "LegacyUser" })])

    expect(rows[0].updatedAt).toBeInstanceOf(Date)
  })

  it("leaves an already normalized handle untouched", async () => {
    const rows = await runMigration([
      contactRow({ _id: "a", handle: "alice@blink.sv", transactionsCount: 4 }),
    ])

    expect(rows[0]).toEqual(
      expect.objectContaining({ handle: "alice@blink.sv", transactionsCount: 4 }),
    )
    expect(rows[0].updatedAt).toBeUndefined()
  })

  it("folds a duplicate into the contact that already holds the normalized handle", async () => {
    const rows = await runMigration([
      contactRow({ _id: "kept", handle: "alice@blink.sv", transactionsCount: 4 }),
      contactRow({ _id: "duplicate", handle: "Alice@Blink.SV", transactionsCount: 7 }),
    ])

    expect(rows).toHaveLength(1)
    expect(rows[0]).toEqual(
      expect.objectContaining({
        _id: "kept",
        handle: "alice@blink.sv",
        transactionsCount: 11,
      }),
    )
  })

  it("folds two variants of the same handle into a single contact", async () => {
    const rows = await runMigration([
      contactRow({ _id: "first", handle: "Alice@Blink.sv", transactionsCount: 2 }),
      contactRow({ _id: "second", handle: "ALICE@BLINK.SV", transactionsCount: 3 }),
    ])

    expect(rows).toHaveLength(1)
    expect(rows[0]).toEqual(
      expect.objectContaining({ handle: "alice@blink.sv", transactionsCount: 5 }),
    )
  })

  it("keeps contacts of another account apart", async () => {
    const rows = await runMigration([
      contactRow({ _id: "other", accountId: "other-account-id" }),
      contactRow({ _id: "mine", handle: "Alice@Blink.SV" }),
    ])

    expect(rows).toHaveLength(2)
    expect(rows.map((row) => row.handle)).toEqual(["alice@blink.sv", "alice@blink.sv"])
  })

  it("keeps contacts of another type apart", async () => {
    const rows = await runMigration([
      contactRow({ _id: "intraledger", type: "intraledger" }),
      contactRow({ _id: "lnaddress", handle: "Alice@Blink.SV" }),
    ])

    expect(rows).toHaveLength(2)
  })

  it("trims surrounding whitespace", async () => {
    const rows = await runMigration([
      contactRow({ _id: "a", handle: "  alice@blink.sv  " }),
    ])

    expect(rows[0]).toHaveProperty("handle", "alice@blink.sv")
  })

  it("lowercases a handle whose uppercase is not ascii", async () => {
    const rows = await runMigration([contactRow({ _id: "a", handle: "ÉLODIE@blink.sv" })])

    expect(rows[0]).toHaveProperty("handle", "élodie@blink.sv")
  })

  it("keeps going when a single row fails", async () => {
    const rows = [
      contactRow({ _id: "broken", handle: "Broken@Blink.SV" }),
      contactRow({ _id: "fine", handle: "Fine@Blink.SV" }),
    ]
    const contacts = fakeContactsCollection(rows)
    jest.spyOn(contacts, "findOne").mockRejectedValueOnce(new Error("connection reset"))

    await migration.up({ collection: () => contacts })

    expect(rows.find((row) => row._id === "broken")).toHaveProperty(
      "handle",
      "Broken@Blink.SV",
    )
    expect(rows.find((row) => row._id === "fine")).toHaveProperty(
      "handle",
      "fine@blink.sv",
    )
  })
})
