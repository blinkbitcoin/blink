import { randomUUID } from "crypto"

import { BtcMapPlaceSubmissionStatus } from "@/domain/btcmap"
import { CouldNotFindBtcMapPlaceSubmissionError } from "@/domain/btcmap/errors"
import { DuplicateKeyForPersistError } from "@/domain/errors"
import { BtcMapPlaceSubmissionsRepository } from "@/services/mongoose"

const submissions = BtcMapPlaceSubmissionsRepository()

const makePendingArgs = () => ({
  accountId: randomUUID() as AccountId,
  submissionId: randomUUID() as BtcMapSubmissionId,
  externalId: randomUUID(),
  lat: 4.6097,
  lon: -74.0817,
  category: "food" as BtcMapCategory,
  name: "Arepas Place" as BtcMapPlaceName,
})

describe("BtcMapPlaceSubmissionsRepository", () => {
  it("inserts a pending submission and finds it by submissionId", async () => {
    const args = makePendingArgs()

    const inserted = await submissions.insertPending(args)
    if (inserted instanceof Error) throw inserted

    expect(inserted).toMatchObject({
      ...args,
      status: BtcMapPlaceSubmissionStatus.Pending,
    })
    expect(inserted.btcMapPlaceId).toBeUndefined()
    expect(inserted.createdAt).toBeInstanceOf(Date)
    expect(inserted.updatedAt).toBeInstanceOf(Date)

    const found = await submissions.findBySubmissionId({
      submissionId: args.submissionId,
    })
    expect(found).toMatchObject({
      ...args,
      status: BtcMapPlaceSubmissionStatus.Pending,
    })
  })

  it("returns CouldNotFindBtcMapPlaceSubmissionError for an unknown submissionId", async () => {
    const result = await submissions.findBySubmissionId({
      submissionId: randomUUID() as BtcMapSubmissionId,
    })

    expect(result).toBeInstanceOf(CouldNotFindBtcMapPlaceSubmissionError)
  })

  it("rejects a duplicate submissionId, even from a different account", async () => {
    // submissions are blink-scoped: the submissionId is unique across accounts
    const args = makePendingArgs()
    const first = await submissions.insertPending(args)
    if (first instanceof Error) throw first

    const duplicate = await submissions.insertPending(args)
    expect(duplicate).toBeInstanceOf(DuplicateKeyForPersistError)

    const otherAccount = await submissions.insertPending({
      ...args,
      accountId: randomUUID() as AccountId,
    })
    expect(otherAccount).toBeInstanceOf(DuplicateKeyForPersistError)
  })

  it("lets exactly one of two concurrent identical inserts win", async () => {
    const args = makePendingArgs()

    const results = await Promise.all([
      submissions.insertPending(args),
      submissions.insertPending(args),
    ])

    const errors = results.filter((r) => r instanceof Error)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toBeInstanceOf(DuplicateKeyForPersistError)
  })

  it("marks a submission submitted with the upstream id and latest fields, keeping the creator", async () => {
    const args = makePendingArgs()
    const inserted = await submissions.insertPending(args)
    if (inserted instanceof Error) throw inserted

    const marked = await submissions.markSubmitted({
      submissionId: args.submissionId,
      btcMapPlaceId: 42,
      lat: 1.2345,
      lon: 2.3456,
      category: "hotel" as BtcMapCategory,
      name: "Arepas Place Fixed" as BtcMapPlaceName,
    })
    if (marked instanceof Error) throw marked

    expect(marked).toMatchObject({
      accountId: args.accountId,
      status: BtcMapPlaceSubmissionStatus.Submitted,
      btcMapPlaceId: 42,
      lat: 1.2345,
      lon: 2.3456,
      category: "hotel",
      name: "Arepas Place Fixed",
    })
    expect(marked.updatedAt.getTime()).toBeGreaterThanOrEqual(
      inserted.updatedAt.getTime(),
    )

    const found = await submissions.findBySubmissionId({
      submissionId: args.submissionId,
    })
    expect(found).toMatchObject({
      status: BtcMapPlaceSubmissionStatus.Submitted,
      btcMapPlaceId: 42,
    })
  })

  it("returns CouldNotFindBtcMapPlaceSubmissionError when marking an unknown submissionId", async () => {
    const result = await submissions.markSubmitted({
      submissionId: randomUUID() as BtcMapSubmissionId,
      btcMapPlaceId: 42,
      lat: 1,
      lon: 2,
      category: "food" as BtcMapCategory,
      name: "Arepas Place" as BtcMapPlaceName,
    })

    expect(result).toBeInstanceOf(CouldNotFindBtcMapPlaceSubmissionError)
  })
})
