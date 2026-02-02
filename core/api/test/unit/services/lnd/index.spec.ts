jest.mock("@/services/redis/connection", () => ({
  redis: {
    on: jest.fn(),
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  },
  redisSub: {
    on: jest.fn(),
    subscribe: jest.fn(),
  },
}))

jest.mock("@/config", () => ({
  getHistoricalLndPubkeys: jest.fn(),
}))

jest.mock("@/services/lnd/config", () => ({
  getLnds: jest.fn(),
  getActiveLnd: jest.fn(),
  getActiveOnchainLnd: jest.fn(),
  getLndFromPubkey: jest.fn(),
  parseLndErrorDetails: jest.fn(),
}))

import { LndService } from "@/services/lnd"
import { getHistoricalLndPubkeys } from "@/config"
import { getLnds, getActiveLnd } from "@/services/lnd/config"

const mockGetHistoricalLndPubkeys = getHistoricalLndPubkeys as jest.MockedFunction<
  typeof getHistoricalLndPubkeys
>
const mockGetLnds = getLnds as jest.MockedFunction<typeof getLnds>
const mockGetActiveLnd = getActiveLnd as jest.MockedFunction<typeof getActiveLnd>

const PUBKEYS = {
  active1:
    "03a1b2c3d4e5f6789012345678901234567890123456789012345678901234567890" as Pubkey,
  active2:
    "03b2c3d4e5f6789012345678901234567890123456789012345678901234567890a" as Pubkey,
  historical1:
    "03c3d4e5f6789012345678901234567890123456789012345678901234567890ab" as Pubkey,
  historical2:
    "03d4e5f6789012345678901234567890123456789012345678901234567890abc" as Pubkey,
  external: "03e5f6789012345678901234567890123456789012345678901234567890abcd" as Pubkey,
} as const

const createMockLndConnect = (pubkey: Pubkey, active = true): LndConnect =>
  ({
    pubkey,
    type: ["offchain"],
    active,
    lnd: {} as AuthenticatedLnd,
    lndGrpcUnauth: {} as UnauthenticatedLnd,
    socket: "localhost:10009",
    cert: "cert",
    macaroon: "macaroon",
    node: "localhost",
    port: 10009,
    name: "lnd1",
  }) as LndConnect

describe("LndService", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetActiveLnd.mockReturnValue(createMockLndConnect(PUBKEYS.active1))
  })

  describe("isLocal", () => {
    it("returns true for active local node pubkeys", () => {
      mockGetLnds.mockReturnValue([createMockLndConnect(PUBKEYS.active1)])

      const lndService = LndService()
      if (lndService instanceof Error) throw lndService

      expect(lndService.isLocal(PUBKEYS.active1)).toBe(true)
    })

    it("returns false for historical pubkeys", () => {
      mockGetLnds.mockReturnValue([createMockLndConnect(PUBKEYS.active1)])

      const lndService = LndService()
      if (lndService instanceof Error) throw lndService

      expect(lndService.isLocal(PUBKEYS.historical1)).toBe(false)
    })
  })

  describe("isLocalOrHistorical", () => {
    it("returns true for active local node pubkeys", () => {
      mockGetLnds.mockReturnValue([
        createMockLndConnect(PUBKEYS.active1),
        createMockLndConnect(PUBKEYS.active2),
      ])
      mockGetHistoricalLndPubkeys.mockReturnValue([])

      const lndService = LndService()
      if (lndService instanceof Error) throw lndService

      expect(lndService.isLocalOrHistorical(PUBKEYS.active1)).toBe(true)
      expect(lndService.isLocalOrHistorical(PUBKEYS.active2)).toBe(true)
    })

    it("returns true for historical pubkeys from retired nodes", () => {
      mockGetLnds.mockReturnValue([createMockLndConnect(PUBKEYS.active1)])
      mockGetHistoricalLndPubkeys.mockReturnValue([
        PUBKEYS.historical1,
        PUBKEYS.historical2,
      ])

      const lndService = LndService()
      if (lndService instanceof Error) throw lndService

      expect(lndService.isLocalOrHistorical(PUBKEYS.historical1)).toBe(true)
      expect(lndService.isLocalOrHistorical(PUBKEYS.historical2)).toBe(true)
    })

    it("returns false for external non-local pubkeys", () => {
      mockGetLnds.mockReturnValue([createMockLndConnect(PUBKEYS.active1)])
      mockGetHistoricalLndPubkeys.mockReturnValue([PUBKEYS.historical1])

      const lndService = LndService()
      if (lndService instanceof Error) throw lndService

      expect(lndService.isLocalOrHistorical(PUBKEYS.external)).toBe(false)
    })

    it("returns true when pubkey is both active and historical", () => {
      mockGetLnds.mockReturnValue([createMockLndConnect(PUBKEYS.active1)])
      mockGetHistoricalLndPubkeys.mockReturnValue([PUBKEYS.active1])

      const lndService = LndService()
      if (lndService instanceof Error) throw lndService

      expect(lndService.isLocalOrHistorical(PUBKEYS.active1)).toBe(true)
    })

    it("returns false when no active nodes and no historical pubkeys", () => {
      mockGetLnds.mockReturnValue([])
      mockGetHistoricalLndPubkeys.mockReturnValue([])

      const lndService = LndService()
      if (lndService instanceof Error) throw lndService

      expect(lndService.isLocalOrHistorical(PUBKEYS.external)).toBe(false)
    })

    it("returns true for historical pubkey when no active nodes", () => {
      mockGetLnds.mockReturnValue([])
      mockGetHistoricalLndPubkeys.mockReturnValue([PUBKEYS.historical1])

      const lndService = LndService()
      if (lndService instanceof Error) throw lndService

      expect(lndService.isLocalOrHistorical(PUBKEYS.historical1)).toBe(true)
      expect(lndService.isLocalOrHistorical(PUBKEYS.external)).toBe(false)
    })
  })
})
