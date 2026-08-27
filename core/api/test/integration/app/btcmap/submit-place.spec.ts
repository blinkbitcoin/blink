import { randomUUID } from "crypto"

jest.mock("@/config", () => ({
  ...jest.requireActual("@/config"),
  BTCMAP_HMAC_SECRET: "integration-test-hmac-secret",
}))

jest.mock("@/services/btcmap", () => ({
  BTCMAP_ORIGIN: "blink",
  BtcMapService: jest.fn(),
}))

import { submitPlace } from "@/app/btcmap"
import { AccountLevel } from "@/domain/accounts"
import { BtcMapPlaceSubmissionStatus } from "@/domain/btcmap"
import { BtcMapUnavailableError } from "@/domain/btcmap/errors"
import { BtcMapService } from "@/services/btcmap"
import { BtcMapPlaceSubmissionsRepository } from "@/services/mongoose"
import { sleep } from "@/utils"

const mockBtcMapService = BtcMapService as jest.Mock
const mockSubmitPlace = jest.fn()

const submissions = BtcMapPlaceSubmissionsRepository()

const makeAccount = (): Account =>
  ({ id: randomUUID(), level: AccountLevel.Two }) as Account

const makeArgs = () => ({
  submissionId: randomUUID(),
  latitude: 4.6097,
  longitude: -74.0817,
  category: "food",
  name: "Arepas Place",
})

const findRecord = async (accountId: AccountId, submissionId: string) => {
  const record = await submissions.findByAccountIdAndSubmissionId({
    accountId,
    submissionId: submissionId as BtcMapSubmissionId,
  })
  if (record instanceof Error) throw record
  return record
}

describe("BtcMap submitPlace (integration)", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockBtcMapService.mockReturnValue({ submitPlace: mockSubmitPlace })
  })

  it("persists the submission, replays it, and applies edits by resubmit", async () => {
    const account = makeAccount()
    const args = makeArgs()
    mockSubmitPlace.mockResolvedValue({ id: 42, origin: "blink", external_id: "echo" })

    // first call: persists pending, calls upstream, marks submitted
    const result = await submitPlace({ account, ...args })
    if (result instanceof Error) throw result
    expect(result.id).toEqual(42)
    expect(mockSubmitPlace).toHaveBeenCalledTimes(1)
    const externalId = mockSubmitPlace.mock.calls[0][0].externalId

    const record = await findRecord(account.id, args.submissionId)
    expect(record).toMatchObject({
      externalId,
      status: BtcMapPlaceSubmissionStatus.Submitted,
      btcMapPlaceId: 42,
    })

    // identical retry: replayed from the record, no second upstream call
    const replay = await submitPlace({ account, ...args })
    expect(replay).toEqual({ id: 42, origin: "blink", externalId })
    expect(mockSubmitPlace).toHaveBeenCalledTimes(1)

    // same submissionId with a changed name: patches upstream with the
    // same external_id and updates the record
    const edit = await submitPlace({ account, ...args, name: "Arepas Place Fixed" })
    expect(edit).not.toBeInstanceOf(Error)
    expect(mockSubmitPlace).toHaveBeenCalledTimes(2)
    expect(mockSubmitPlace.mock.calls[1][0].externalId).toEqual(externalId)
    expect(mockSubmitPlace.mock.calls[1][0].name).toEqual("Arepas Place Fixed")

    const edited = await findRecord(account.id, args.submissionId)
    expect(edited.name).toEqual("Arepas Place Fixed")
  })

  it("does not let an id exposed by BTC Map modify the original submission from another account", async () => {
    const creator = makeAccount()
    const attacker = makeAccount()
    const args = makeArgs()
    mockSubmitPlace.mockResolvedValue({ id: 42, origin: "blink", external_id: "echo" })

    const result = await submitPlace({ account: creator, ...args })
    if (result instanceof Error) throw result
    const creatorExternalId = mockSubmitPlace.mock.calls[0][0].externalId

    // the attacker learns the submissionId (e.g. from btcmap's public data)
    // and resubmits it with changed fields, trying to edit the place
    mockSubmitPlace.mockResolvedValue({ id: 43, origin: "blink", external_id: "echo" })
    const attack = await submitPlace({
      account: attacker,
      ...args,
      name: "Defaced Place",
    })
    expect(attack).not.toBeInstanceOf(Error)

    // the attacker's submission carries its own account-scoped external id,
    // so btcmap treats it as a new place rather than patching the original
    const attackerExternalId = mockSubmitPlace.mock.calls[1][0].externalId
    expect(attackerExternalId).not.toEqual(creatorExternalId)
    expect(attackerExternalId.endsWith(`:${args.submissionId}`)).toBe(true)

    // the original submission is untouched: same record, fields and place id
    const original = await findRecord(creator.id, args.submissionId)
    expect(original).toMatchObject({
      accountId: creator.id,
      externalId: creatorExternalId,
      status: BtcMapPlaceSubmissionStatus.Submitted,
      btcMapPlaceId: 42,
      name: args.name,
    })

    // the attacker's edit lives on its own record instead
    const attackerRecord = await findRecord(attacker.id, args.submissionId)
    expect(attackerRecord).toMatchObject({
      accountId: attacker.id,
      externalId: attackerExternalId,
      btcMapPlaceId: 43,
      name: "Defaced Place",
    })
  })

  it("serializes concurrent different payloads so upstream and the record converge", async () => {
    const account = makeAccount()
    const args = makeArgs()

    // hold every upstream call until the test releases it, so completion
    // order is forced rather than left to timing
    type Deferred = {
      serviceArgs: { externalId: string; name: string }
      resolve: (value: { id: number; origin: string; external_id: string }) => void
    }
    const pending: Deferred[] = []
    mockSubmitPlace.mockImplementation(
      (serviceArgs) =>
        new Promise((resolve) => {
          pending.push({ serviceArgs, resolve })
        }),
    )
    const totalUpstreamCalls = () => mockSubmitPlace.mock.calls.length
    const waitForUpstreamCalls = async (n: number) => {
      for (let i = 0; i < 400 && totalUpstreamCalls() < n; i++) await sleep(25)
      if (totalUpstreamCalls() < n) {
        throw new Error(`timed out waiting for ${n} upstream calls`)
      }
    }
    const popDeferredFor = (name: string): Deferred => {
      const index = pending.findIndex((d) => d.serviceArgs.name === name)
      if (index === -1) throw new Error(`no pending upstream call for "${name}"`)
      return pending.splice(index, 1)[0]
    }
    const resolveUpstream = (name: string) =>
      popDeferredFor(name).resolve({
        id: 42,
        origin: "blink",
        external_id: name,
      })

    const first = submitPlace({ account, ...args, name: "First Payload" })
    const second = submitPlace({ account, ...args, name: "Second Payload" })
    const promiseByPayload: Record<string, ReturnType<typeof submitPlace>> = {
      "First Payload": first,
      "Second Payload": second,
    }

    await waitForUpstreamCalls(1)
    await sleep(100) // let a racing second workflow arrive, if unsynchronized

    if (totalUpstreamCalls() === 2) {
      // unsynchronized: both workflows are in flight together. Force reversed
      // completion — the payload that reached btcmap LAST finishes its mongo
      // update FIRST, so btcmap keeps one version while the record converges
      // on the other
      const [, lastArrived] = mockSubmitPlace.mock.calls
      const firstArrivedName = mockSubmitPlace.mock.calls[0][0].name
      const lastArrivedName = lastArrived[0].name
      resolveUpstream(lastArrivedName)
      const lastResult = await promiseByPayload[lastArrivedName]
      if (lastResult instanceof Error) throw lastResult
      resolveUpstream(firstArrivedName)
      const firstArrivedResult = await promiseByPayload[firstArrivedName]
      if (firstArrivedResult instanceof Error) throw firstArrivedResult
    } else {
      // serialized: only the lock holder's call is in flight; the second
      // workflow can only reach upstream once the first one has fully marked
      // its record and released the lock
      const holderName = pending[0].serviceArgs.name
      resolveUpstream(holderName)
      const holderResult = await promiseByPayload[holderName]
      if (holderResult instanceof Error) throw holderResult
      await waitForUpstreamCalls(2)
      const waiterName = pending[0].serviceArgs.name
      resolveUpstream(waiterName)
      const waiterResult = await promiseByPayload[waiterName]
      if (waiterResult instanceof Error) throw waiterResult
    }

    // btcmap applies resubmits in arrival order, so the last upstream payload
    // is the version btcmap holds; the persisted record must converge on it
    const upstreamVersion = mockSubmitPlace.mock.calls[totalUpstreamCalls() - 1][0].name
    const record = await findRecord(account.id, args.submissionId)
    expect(record).toMatchObject({
      status: BtcMapPlaceSubmissionStatus.Submitted,
      btcMapPlaceId: 42,
      name: upstreamVersion,
    })

    // and a later request matching the persisted version is a true replay —
    // the API must never report a version that is not actually upstream
    const replay = await submitPlace({ account, ...args, name: record.name })
    expect(replay).toMatchObject({ id: 42, origin: "blink" })
    expect(totalUpstreamCalls()).toEqual(2)
  })

  it("keeps the record pending on an ambiguous failure and reuses the external id on retry", async () => {
    const account = makeAccount()
    const args = makeArgs()

    mockSubmitPlace.mockResolvedValueOnce(new BtcMapUnavailableError())
    const firstResult = await submitPlace({ account, ...args })
    expect(firstResult).toBeInstanceOf(BtcMapUnavailableError)

    const pendingRecord = await findRecord(account.id, args.submissionId)
    expect(pendingRecord.status).toEqual(BtcMapPlaceSubmissionStatus.Pending)

    mockSubmitPlace.mockResolvedValueOnce({ id: 7, origin: "blink", external_id: "e" })
    const retryResult = await submitPlace({ account, ...args })
    expect(retryResult).not.toBeInstanceOf(Error)

    expect(mockSubmitPlace).toHaveBeenCalledTimes(2)
    expect(mockSubmitPlace.mock.calls[1][0].externalId).toEqual(
      mockSubmitPlace.mock.calls[0][0].externalId,
    )

    const record = await findRecord(account.id, args.submissionId)
    expect(record).toMatchObject({
      status: BtcMapPlaceSubmissionStatus.Submitted,
      btcMapPlaceId: 7,
    })
  })
})
