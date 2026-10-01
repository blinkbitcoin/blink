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
  LND_MAX_PAYMENT_PATHS: 1,
}))

jest.mock("@/services/lnd/config", () => ({
  getLnds: jest.fn(),
  getActiveLnd: jest.fn(),
  getActiveOnchainLnd: jest.fn(),
  getLndFromPubkey: jest.fn(),
  parseLndErrorDetails: jest.fn(),
}))

jest.mock("@/services/tracing", () => ({
  ...jest.requireActual("@/services/tracing"),
  addAttributesToCurrentSpan: jest.fn(),
}))

jest.mock("lightning", () => {
  const actual = jest.requireActual("lightning")
  return {
    ...actual,
    payViaPaymentDetails: jest.fn(),
  }
})

import { payViaPaymentDetails } from "lightning"

import {
  FeatureCompatibilityError,
  LnPaymentPendingError,
} from "@/domain/bitcoin/lightning"
import { LndService } from "@/services/lnd"
import { getHistoricalLndPubkeys } from "@/config"
import { addAttributesToCurrentSpan } from "@/services/tracing"
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
    jest.restoreAllMocks()
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

  describe("payInvoiceViaPaymentDetails multipath payments", () => {
    it.each([
      [1, 25_000, 1, false],
      [2, 30_000, 2, false],
      [4, 40_000, 3, false],
      [16, 40_000, 4, false],
      [4, 40_000, 0, true],
    ])(
      "forwards max_paths %i with timeout %i and traces %i shards",
      async (maxPaths, timeout, shards, pending) => {
        jest.replaceProperty(
          jest.requireMock("@/config"),
          "LND_MAX_PAYMENT_PATHS",
          maxPaths,
        )
        const lndConnect = createMockLndConnect(PUBKEYS.active1)
        mockGetLnds.mockImplementation(({ active, type } = {}) => {
          if (active === true && type === "offchain") return [lndConnect]
          if (type === "offchain") return [lndConnect]
          return []
        })

        mockPayViaPaymentDetails.mockImplementation((async () => ({
          safe_fee: 0,
          paths: Array.from({ length: shards }, () => ({})),
          secret: "c".repeat(64),
        })) as unknown as typeof payViaPaymentDetails)

        if (pending) {
          jest.useFakeTimers()
          mockPayViaPaymentDetails.mockImplementation(() => new Promise(() => undefined))
        }
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

        const resultPromise = lndService.payInvoiceViaPaymentDetails({
          decodedInvoice,
          btcPaymentAmount,
          maxFeeAmount: undefined,
        })

        if (pending) await jest.advanceTimersByTimeAsync(45_000)
        const result = await resultPromise
        jest.useRealTimers()

        expect(addAttributesToCurrentSpan).toHaveBeenCalledWith({
          "lightning.payment.max_paths": maxPaths,
          "lightning.payment.pathfinding_timeout_ms": timeout,
        })
        const pendingResult = expect.any(LnPaymentPendingError)
        expect(result).toEqual(
          pending
            ? pendingResult
            : {
                roundedUpFee: 0,
                revealedPreImage: "c".repeat(64),
                sentFromPubkey: PUBKEYS.active1,
              },
        )
        expect(jest.mocked(addAttributesToCurrentSpan).mock.calls).toEqual([
          [
            {
              "lightning.payment.max_paths": maxPaths,
              "lightning.payment.pathfinding_timeout_ms": timeout,
            },
          ],
          ...(pending ? [] : [[{ "lightning.payment.shard_count": shards }]]),
        ])
        expect(mockPayViaPaymentDetails).toHaveBeenCalledWith(
          expect.objectContaining({ max_paths: maxPaths, pathfinding_timeout: timeout }),
        )
      },
    )
  })

  describe("payInvoiceViaPaymentDetails error mapping", () => {
    it("maps missing feature dependency error to FeatureCompatibilityError", async () => {
      const lndConnect = createMockLndConnect(PUBKEYS.active1)
      mockGetLnds.mockImplementation(({ active, type } = {}) => {
        if (active === true && type === "offchain") return [lndConnect]
        if (type === "offchain") return [lndConnect]
        return []
      })

      const lndError = [
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
        throw lndError
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

      expect(result).toBeInstanceOf(FeatureCompatibilityError)
      expect(mockParseLndErrorDetails).toHaveBeenCalledWith(lndError)
    })

    it("maps unknown required feature error to FeatureCompatibilityError", async () => {
      const lndConnect = createMockLndConnect(PUBKEYS.active1)
      mockGetLnds.mockImplementation(({ active, type } = {}) => {
        if (active === true && type === "offchain") return [lndConnect]
        if (type === "offchain") return [lndConnect]
        return []
      })

      const lndError = [
        503,
        "UnexpectedErrInGetRouteToDestination",
        {
          err: {
            code: 2,
            details: "unknown required feature",
            metadata: {
              "content-type": ["application/grpc"],
            },
          },
        },
      ]

      mockPayViaPaymentDetails.mockImplementation(async () => {
        throw lndError
      })
      mockParseLndErrorDetails.mockReturnValue("unknown required feature")

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

      expect(result).toBeInstanceOf(FeatureCompatibilityError)
      expect(mockParseLndErrorDetails).toHaveBeenCalledWith(lndError)
    })
  })
})
