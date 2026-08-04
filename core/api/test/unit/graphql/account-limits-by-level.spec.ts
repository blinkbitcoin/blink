import { getAccountLimits, SECS_PER_DAY } from "@/config"
import { AccountLevel } from "@/domain/accounts"
import Globals from "@/graphql/public/types/object/globals"

type AccountLevelLimitsRow = {
  level: AccountLevel
  interval: Seconds
  withdrawal: UsdCents
  internalSend: UsdCents
  convert: UsdCents
}

describe("Globals.accountLimitsByLevel", () => {
  const field = Globals.getFields().accountLimitsByLevel

  it("is exposed on the Globals type", () => {
    expect(field).toBeDefined()
    expect(String(field.type)).toEqual("[AccountLevelLimits!]!")
  })

  it("returns one row per account level with the enforced config values", () => {
    const resolve = field.resolve
    if (!resolve) throw new Error("accountLimitsByLevel must define a resolver")

    const rows = resolve(
      {},
      {},
      {} as GraphQLPublicContext,
      {} as never,
    ) as AccountLevelLimitsRow[]

    const levels = Object.values(AccountLevel)
    expect(rows).toHaveLength(levels.length)
    expect(rows.map((row) => row.level)).toEqual(levels)

    for (const level of levels) {
      const expected = getAccountLimits({ level })
      expect(rows[level]).toEqual({
        level,
        interval: SECS_PER_DAY,
        withdrawal: expected.withdrawalLimit,
        internalSend: expected.intraLedgerLimit,
        convert: expected.tradeIntraAccountLimit,
      })
    }
  })
})
