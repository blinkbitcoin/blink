const mockBalance = jest.fn()
const mockSubmit = jest.fn()
const mockUsing = jest.fn()

jest.mock("@/config", () => {
  const config = {
    receiveWalletName: "receive",
    withdrawalWalletName: "withdrawal",
    rebalances: {
      receiveToWithdrawal: {
        minBalance: 200_000,
        threshold: 5_000_000,
        minRebalanceSize: 4_800_000,
        payoutQueueName: "internal",
      },
    },
  }
  return {
    getBriaConfig: () => config,
    BRIA_API_KEY: "test-key",
    NETWORK: "regtest",
  }
})
jest.mock("@/services/bria/grpc-client", () => ({
  getWalletBalanceSummary: (...args: unknown[]) => mockBalance(...args),
  submitPayout: (...args: unknown[]) => mockSubmit(...args),
}))
jest.mock("@/services/bria/event-handler", () => ({}))
jest.mock("@/services/bria/event-repository", () => ({}))
jest.mock("@/services/logger", () => ({ baseLogger: {} }))
jest.mock("@/utils", () => ({ GrpcStreamClient: {} }))
jest.mock("@/services/redis", () => ({ redis: {} }))
jest.mock("@/services/tracing", () => ({
  wrapAsyncFunctionsToRunInSpan: ({ fns }: { fns: unknown }) => fns,
  addAttributesToCurrentSpan: jest.fn(),
}))
jest.mock("redlock", () => {
  class ExecutionError extends Error {}
  return {
    __esModule: true,
    ExecutionError,
    default: jest.fn().mockImplementation(() => ({
      using: (...args: unknown[]) => mockUsing(...args),
    })),
  }
})

import { ExecutionError } from "redlock"

import { getBriaConfig } from "@/config"

import { rebalanceToWithdrawalWallet } from "@/app/on-chain/rebalance-to-withdrawal-wallet"
import { UnknownOnChainServiceError } from "@/domain/bitcoin/onchain"
import {
  ResourceAttemptsRedlockServiceError,
  ResourceExpiredLockServiceError,
} from "@/domain/lock"
import { BigIntFloatConversionError } from "@/domain/shared"
import { OnChainService } from "@/services/bria"
import {
  GetWalletBalanceSummaryResponse,
  SubmitPayoutRequest,
  SubmitPayoutResponse,
} from "@/services/bria/proto/bria_pb"

const mockConfig = getBriaConfig()
let settled: number
let reserved: number
let signal: { aborted: boolean }

beforeEach(() => {
  jest.clearAllMocks()
  settled = 10_000_000
  reserved = 0
  signal = { aborted: false }
  mockConfig.withdrawalWalletName = "withdrawal"
  mockConfig.rebalances.receiveToWithdrawal.minBalance = 200_000 as Satoshis
  mockBalance.mockReset().mockImplementation(async () => {
    const response = new GetWalletBalanceSummaryResponse()
    response.setEffectiveSettled(settled)
    response.setEffectiveEncumberedOutgoing(reserved)
    return response
  })
  mockSubmit.mockReset().mockImplementation(async (request: SubmitPayoutRequest) => {
    reserved += request.getSatoshis()
    const response = new SubmitPayoutResponse()
    response.setId("payout-id")
    return response
  })
  // Model the per-resource serialization promised by Redlock's using API.
  const locks = new Map<string, Promise<unknown>>()
  mockUsing.mockReset().mockImplementation((resources, _ttl, routine) => {
    const key = resources[0]
    const next = (locks.get(key) || Promise.resolve()).then(() => routine(signal))
    locks.set(
      key,
      next.catch(() => undefined),
    )
    return next
  })
})

it("reserves one rebalance across several settled deposit events", async () => {
  expect(await rebalanceToWithdrawalWallet()).toBe(true)
  for (const deposit of [100_000, 200_000, 10_000]) {
    settled += deposit
    expect(await rebalanceToWithdrawalWallet()).toBe(true)
  }
  expect(mockSubmit).toHaveBeenCalledTimes(1)
  const request = mockSubmit.mock.calls[0][0] as SubmitPayoutRequest
  expect(request.getSatoshis()).toBe(9_800_000)
  expect(request.getWalletName()).toBe("receive")
  expect(request.getDestinationWalletName()).toBe("withdrawal")
  expect(request.getPayoutQueueName()).toBe("internal")
  expect(request.getExternalId()).toBe("rebalance-receive-withdrawal-9800000")
  expect(mockBalance.mock.calls[0][0].getWalletName()).toBe("receive")
  expect(mockUsing).toHaveBeenCalledWith(
    ["locks:onchainrebalance:receive"],
    expect.any(Number),
    expect.any(Function),
  )
})

it("allows another rebalance only from new unreserved funds", async () => {
  await rebalanceToWithdrawalWallet()
  settled += 6_000_000
  expect(await rebalanceToWithdrawalWallet()).toBe(true)
  expect(mockSubmit.mock.calls.map(([request]) => request.getSatoshis())).toEqual([
    9_800_000, 6_000_000,
  ])
  expect(settled - reserved).toBe(200_000)
})

it("does not deduct a batched payout twice after it leaves the settled balance", async () => {
  await rebalanceToWithdrawalWallet()
  // Bria moves the payout out of both settled and encumbered when batching it.
  settled -= reserved
  reserved = 0
  settled += 6_000_000
  expect(await rebalanceToWithdrawalWallet()).toBe(true)
  expect(mockSubmit.mock.calls.map(([request]) => request.getSatoshis())).toEqual([
    9_800_000, 6_000_000,
  ])
})

it("keeps the settled-balance API independent of outgoing reservations", async () => {
  reserved = 9_800_000
  expect(await OnChainService().getReceiveWalletBalance()).toEqual({
    amount: 10_000_000n,
    currency: "BTC",
  })
  expect(await OnChainService().getReceiveWalletAvailableBalance()).toEqual({
    amount: 200_000n,
    currency: "BTC",
  })
})

it("holds the wallet lock through submission before another caller reads its balance", async () => {
  let release!: () => void
  const submitted = new Promise<void>((resolve) => {
    release = resolve
  })
  let entered!: () => void
  const submitting = new Promise<void>((resolve) => {
    entered = resolve
  })
  mockSubmit.mockImplementationOnce(async (request: SubmitPayoutRequest) => {
    entered()
    await submitted
    reserved += request.getSatoshis()
    return new SubmitPayoutResponse()
  })
  const first = rebalanceToWithdrawalWallet()
  await submitting
  settled += 100_000
  const second = rebalanceToWithdrawalWallet()
  await Promise.resolve()
  expect(mockBalance).toHaveBeenCalledTimes(1)
  release()
  expect(await Promise.all([first, second])).toEqual([true, true])
  expect(mockBalance).toHaveBeenCalledTimes(2)
  expect(mockSubmit).toHaveBeenCalledTimes(1)
})

it.each([5_000_000, 200_000, 0, -1_000_000])(
  "does not submit when unreserved funds are %i sats",
  async (available) => {
    reserved = settled - available
    expect(await rebalanceToWithdrawalWallet()).toBe(true)
    expect(mockSubmit).not.toHaveBeenCalled()
    expect(await OnChainService().getReceiveWalletAvailableBalance()).toEqual({
      amount: BigInt(Math.max(0, available)),
      currency: "BTC",
    })
  },
)

it("submits immediately above the threshold and leaves the configured reserve", async () => {
  reserved = 4_999_999
  expect(await rebalanceToWithdrawalWallet()).toBe(true)
  expect(mockSubmit.mock.calls[0][0].getSatoshis()).toBe(4_800_001)
})

it("skips locking and RPCs when receive and withdrawal are the same wallet", async () => {
  mockConfig.withdrawalWalletName = "receive"
  expect(await rebalanceToWithdrawalWallet()).toBe(true)
  expect(mockUsing).not.toHaveBeenCalled()
  expect(mockBalance).not.toHaveBeenCalled()
  expect(mockSubmit).not.toHaveBeenCalled()
})

it("propagates a balance RPC failure without submitting", async () => {
  mockBalance.mockRejectedValueOnce(new Error("unavailable"))
  expect(await rebalanceToWithdrawalWallet()).toBeInstanceOf(UnknownOnChainServiceError)
  expect(mockSubmit).not.toHaveBeenCalled()
})

it("propagates an invalid rebalance amount without submitting", async () => {
  mockConfig.rebalances.receiveToWithdrawal.minBalance = 200_000.5 as Satoshis
  expect(await rebalanceToWithdrawalWallet()).toBeInstanceOf(BigIntFloatConversionError)
  expect(mockSubmit).not.toHaveBeenCalled()
})

it("propagates submission failure and preserves the request id on retry", async () => {
  mockSubmit.mockRejectedValueOnce(new Error("unavailable"))
  expect(await rebalanceToWithdrawalWallet()).toBeInstanceOf(UnknownOnChainServiceError)
  expect(await rebalanceToWithdrawalWallet()).toBe(true)
  expect(mockSubmit.mock.calls.map(([request]) => request.getExternalId())).toEqual([
    "rebalance-receive-withdrawal-9800000",
    "rebalance-receive-withdrawal-9800000",
  ])
})

it("does not resubmit if a timed-out submission has already reserved the funds", async () => {
  mockSubmit.mockImplementationOnce(async (request: SubmitPayoutRequest) => {
    reserved += request.getSatoshis()
    throw new Error("response lost")
  })
  expect(await rebalanceToWithdrawalWallet()).toBeInstanceOf(UnknownOnChainServiceError)
  expect(await rebalanceToWithdrawalWallet()).toBe(true)
  expect(mockSubmit).toHaveBeenCalledTimes(1)
})

it("does not submit after losing the lock during the balance read", async () => {
  mockBalance.mockImplementationOnce(async () => {
    signal.aborted = true
    const response = new GetWalletBalanceSummaryResponse()
    response.setEffectiveSettled(settled)
    return response
  })
  expect(await rebalanceToWithdrawalWallet()).toBeInstanceOf(
    ResourceExpiredLockServiceError,
  )
  expect(mockSubmit).not.toHaveBeenCalled()
})

it("does not read or submit if the lock cannot be acquired", async () => {
  mockUsing.mockRejectedValueOnce(new ExecutionError("held", []))
  expect(await rebalanceToWithdrawalWallet()).toBeInstanceOf(
    ResourceAttemptsRedlockServiceError,
  )
  expect(mockBalance).not.toHaveBeenCalled()
  expect(mockSubmit).not.toHaveBeenCalled()
})
