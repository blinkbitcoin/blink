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

jest.mock("lightning", () => {
  const actual = jest.requireActual("lightning")
  return {
    ...actual,
    payViaPaymentDetails: jest.fn(),
  }
})

import { payViaPaymentDetails } from "lightning"

import { DestinationMissingDependentFeatureError } from "@/domain/bitcoin/lightning"
import { LndService } from "@/services/lnd"
import { getHistoricalLndPubkeys } from "@/config"
import { getLnds, getActiveLnd, parseLndErrorDetails } from "@/services/lnd/config"

const mockGetHistoricalLndPubkeys = getHistoricalLndPubkeys as jest.MockedFunction<
  typeof getHistoricalLndPubkeys
>
const mockPayViaPaymentDetails = payViaPaymentDetails as jest.MockedFunction<
  typeof payViaPaymentDetails
>
const mockGetLnds = getLnds as jest.MockedFunction<typeof getLnds>
const mockGetActiveLnd = getActiveLnd as jest.MockedFunction<typeof getActiveLnd>
const mockParseLndErrorDetails = parseLndErrorDetails as jest.MockedFunction<
  typeof parseLndErrorDetails
>

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

  describe("payInvoiceViaPaymentDetails error mapping", () => {
    it("maps exact missing feature dependency error to DestinationMissingDependentFeatureError", async () => {
      const lndConnect = createMockLndConnect(PUBKEYS.active1)
      mockGetLnds.mockImplementation(({ active, type } = {}) => {
        if (active === true && type === "offchain") return [lndConnect]
        if (type === "offchain") return [lndConnect]
        return []
      })

      const exactLndError = [
        503,
        "UnexpectedPaymentError",
        {
          err: {
            code: 2,
            details: "missing feature dependency: 9",
            metadata: {
              "content-type": ["application/grpc"],
            },
          },
        },
      ]

      mockPayViaPaymentDetails.mockImplementation(async () => {
        throw exactLndError
      })
      mockParseLndErrorDetails.mockReturnValue("missing feature dependency: 9")

      const lndService = LndService()
      if (lndService instanceof Error) throw lndService

      const decodedInvoice = {
        paymentHash: "a".repeat(64),
        destination: PUBKEYS.external,
        paymentRequest: "lnbc1test",
        milliSatsAmount: 1000,
        description: "test",
        paymentSecret: "b".repeat(64),
        cltvDelta: 40,
        amount: 1,
        paymentAmount: {
          amount: 1n,
          currency: "BTC",
        },
        features: [],
        routeHints: [],
        expiresAt: new Date(Date.now() + 60_000),
        isExpired: false,
      } as unknown as LnInvoice

      const btcPaymentAmount = {
        amount: 1n,
        currency: "BTC",
      } as BtcPaymentAmount

      const result = await lndService.payInvoiceViaPaymentDetails({
        decodedInvoice,
        btcPaymentAmount,
        maxFeeAmount: undefined,
      })

      expect(result).toBeInstanceOf(DestinationMissingDependentFeatureError)
      expect(mockParseLndErrorDetails).toHaveBeenCalledWith(exactLndError)
    })
  })
})
