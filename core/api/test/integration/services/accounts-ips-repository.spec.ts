import { CouldNotFindAccountIpError } from "@/domain/errors"
import { AccountsIpsRepository } from "@/services/mongoose/accounts-ips"
import { AccountIps } from "@/services/mongoose/schema"

import { randomAccountId } from "test/helpers"

const accountsIps = AccountsIpsRepository()

const seedIp = async ({
  accountId,
  ip,
  firstConnection,
  metadata,
}: {
  accountId: AccountId
  ip: string
  firstConnection: Date
  metadata?: IPType
}) =>
  AccountIps.create({
    accountId,
    ip,
    firstConnection,
    lastConnection: firstConnection,
    ...(metadata ? { metadata } : {}),
  })

describe("AccountsIps Repository - findEarliestByAccountId", () => {
  it("returns CouldNotFindAccountIpError when the account has no rows", async () => {
    const result = await accountsIps.findEarliestByAccountId(randomAccountId())
    expect(result).toBeInstanceOf(CouldNotFindAccountIpError)
  })

  it("selects the row with the earliest firstConnection regardless of insertion order", async () => {
    const accountId = randomAccountId()
    await seedIp({
      accountId,
      ip: "203.0.113.2",
      firstConnection: new Date("2023-06-01T00:00:00Z"),
      metadata: { isoCode: "US" },
    })
    await seedIp({
      accountId,
      ip: "203.0.113.1",
      firstConnection: new Date("2021-01-01T00:00:00Z"),
      metadata: { isoCode: "FR" },
    })
    await seedIp({
      accountId,
      ip: "203.0.113.3",
      firstConnection: new Date("2022-03-15T00:00:00Z"),
      metadata: { isoCode: "DE" },
    })

    const result = await accountsIps.findEarliestByAccountId(accountId)
    if (result instanceof Error) throw result
    expect(result.ip).toBe("203.0.113.1")
    expect(result.metadata.isoCode).toBe("FR")
  })

  it("breaks a firstConnection tie deterministically by _id", async () => {
    const accountId = randomAccountId()
    const firstConnection = new Date("2022-01-01T00:00:00Z")
    await seedIp({
      accountId,
      ip: "203.0.113.10",
      firstConnection,
      metadata: { isoCode: "ES" },
    })
    await seedIp({
      accountId,
      ip: "203.0.113.11",
      firstConnection,
      metadata: { isoCode: "PT" },
    })

    const result = await accountsIps.findEarliestByAccountId(accountId)
    if (result instanceof Error) throw result
    expect(result.ip).toBe("203.0.113.10")
  })

  it("returns the earliest row even when it has no metadata and a later row does", async () => {
    const accountId = randomAccountId()
    await seedIp({
      accountId,
      ip: "203.0.113.20",
      firstConnection: new Date("2020-01-01T00:00:00Z"),
    })
    await seedIp({
      accountId,
      ip: "203.0.113.21",
      firstConnection: new Date("2023-01-01T00:00:00Z"),
      metadata: { isoCode: "IE" },
    })

    const result = await accountsIps.findEarliestByAccountId(accountId)
    if (result instanceof Error) throw result
    expect(result.ip).toBe("203.0.113.20")
    expect(result.metadata?.isoCode).toBeUndefined()
  })
})
