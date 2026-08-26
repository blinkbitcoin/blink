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
