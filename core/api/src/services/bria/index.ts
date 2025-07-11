import { Metadata, status } from "@grpc/grpc-js"
import { ListValue, Struct, Value } from "google-protobuf/google/protobuf/struct_pb"

import { PayoutQueueNotFoundError, UnknownBriaEventError } from "./errors"

import { eventDataHandler } from "./event-handler"

import { BriaEventRepo } from "./event-repository"

import {
  estimatePayoutFee,
  getAddress,
  getPayout,
  getWalletBalanceSummary,
  newAddress,
  submitPayout,
  subscribeAll,
  listPayoutQueues as listPayoutQueuesGrpc,
} from "./grpc-client"

import {
  EstimatePayoutFeeRequest,
  GetAddressRequest,
  GetPayoutRequest,
  GetWalletBalanceSummaryRequest,
  ListPayoutQueuesRequest,
  NewAddressRequest,
  BriaEvent as RawBriaEvent,
  SubmitPayoutRequest,
  SubscribeAllRequest,
} from "./proto/bria_pb"

import { BRIA_API_KEY, getBriaConfig } from "@/config"

import {
  OnChainAddressAlreadyCreatedForRequestIdError,
  OnChainAddressNotFoundError,
  PayoutDestinationBlocked,
  PayoutNotFoundError,
  UnknownOnChainServiceError,
} from "@/domain/bitcoin/onchain"
import {
  WalletCurrency,
  parseErrorMessageFromUnknown,
  paymentAmountFromNumber,
} from "@/domain/shared"

import { baseLogger } from "@/services/logger"
import { wrapAsyncFunctionsToRunInSpan, wrapAsyncToRunInSpan } from "@/services/tracing"

import { GrpcStreamClient } from "@/utils"

export { BriaPayloadType } from "./event-handler"

const briaConfig = getBriaConfig()
const { streamBuilder, FibonacciBackoff } = GrpcStreamClient

export const BriaSubscriber = () => {
  const metadata = new Metadata()
  metadata.set("x-bria-api-key", BRIA_API_KEY)

  const subscribeToAll = async (
    eventHandler: BriaEventHandler,
  ): Promise<Stream<RawBriaEvent> | BriaEventError> => {
    try {
      const lastSequence = await BriaEventRepo().getLatestSequence()
      if (lastSequence instanceof Error) {
        return lastSequence
      }

      const request = new SubscribeAllRequest()
      request.setAugment(true)
      request.setAfterSequence(lastSequence)

      const onDataHandler = wrapAsyncToRunInSpan({
        root: true,
        namespace: "service.bria",
        fnName: "subscribeToAllHandler",
        fn: eventDataHandler(eventHandler),
      })

      return streamBuilder<RawBriaEvent, SubscribeAllRequest>(subscribeAll)
        .withOptions({ retry: true, acceptDataOnReconnect: false })
        .withRequest(request)
        .withMetadata(metadata)
        .onData(onDataHandler)
        .onError(async (stream, error) => {
          baseLogger.info({ error }, "Error subscribeToAll stream")
          const sequence = await BriaEventRepo().getLatestSequence()
          if (sequence instanceof Error) {
            // worst case it will reprocess some events
            baseLogger.error({ error: sequence }, "Error getting last sequence")
            return
          }
          stream.request.setAfterSequence(sequence)
        })
        .onRetry((_, { detail }) =>
          baseLogger.info({ ...detail }, "Retry subscribeToAll stream"),
        )
        .withBackoff(new FibonacciBackoff(30000, 7))
        .build()
    } catch (error) {
      return new UnknownBriaEventError(error)
    }
  }

  return {
    subscribeToAll,
  }
}

const queueNameForSpeed = (speed: PayoutSpeed): string | PayoutQueueNotFoundError => {
  const queue = briaConfig.payoutQueues.find((queue) => queue.speed === speed)
  if (!queue) {
    return new PayoutQueueNotFoundError()
  }

  return queue.queueName
}

export const OnChainService = (): IOnChainService => {
  const metadata = new Metadata()
  metadata.set("x-bria-api-key", BRIA_API_KEY)

  const getHotBalance = async (): Promise<BtcPaymentAmount | OnChainServiceError> => {
    try {
      const receiveWalletName = briaConfig.receiveWalletName
      const withdrawalWalletName = briaConfig.withdrawalWalletName

      const request = new GetWalletBalanceSummaryRequest()
      request.setWalletName(receiveWalletName)

      const response = await getWalletBalanceSummary(request, metadata)
      let balance = response.getEffectiveSettled()

      if (receiveWalletName !== withdrawalWalletName) {
        const request = new GetWalletBalanceSummaryRequest()
        request.setWalletName(withdrawalWalletName)

        const response = await getWalletBalanceSummary(request, metadata)
        balance += response.getEffectiveSettled()
      }

      return paymentAmountFromNumber({
        amount: balance,
        currency: WalletCurrency.Btc,
      })
    } catch (error) {
      return new UnknownOnChainServiceError(error)
    }
  }

  const getWalletBalance = async (
    walletName: string,
  ): Promise<BtcPaymentAmount | OnChainServiceError> => {
    try {
      const request = new GetWalletBalanceSummaryRequest()
      request.setWalletName(walletName)

      const response = await getWalletBalanceSummary(request, metadata)

      return paymentAmountFromNumber({
        amount: response.getEffectiveSettled(),
        currency: WalletCurrency.Btc,
      })
    } catch (error) {
      return new UnknownOnChainServiceError(error)
    }
  }

  const getReceiveWalletBalance = async (): Promise<
    BtcPaymentAmount | OnChainServiceError
  > => {
    return getWalletBalance(briaConfig.receiveWalletName)
  }

  const getWithdrawalWalletBalance = async (): Promise<
    BtcPaymentAmount | OnChainServiceError
  > => {
    return getWalletBalance(briaConfig.withdrawalWalletName)
  }

  const getColdBalance = async (): Promise<BtcPaymentAmount | OnChainServiceError> => {
    const request = new GetWalletBalanceSummaryRequest()
    request.setWalletName(briaConfig.coldWalletName)

    try {
      const response = await getWalletBalanceSummary(request, metadata)

      return paymentAmountFromNumber({
        amount: response.getEffectiveSettled(),
        currency: WalletCurrency.Btc,
      })
    } catch (error) {
      return new UnknownOnChainServiceError(error)
    }
  }

  const getAddressForWallet = async ({
    walletDescriptor,
    requestId,
  }: {
    walletDescriptor: WalletDescriptor<WalletCurrency>
    requestId?: OnChainAddressRequestId
  }): Promise<OnChainAddressIdentifier | OnChainServiceError> => {
    try {
      const request = new NewAddressRequest()
      request.setWalletName(briaConfig.receiveWalletName)
      request.setMetadata(
        constructMetadata({ galoy: { walletDetails: walletDescriptor } }),
      )
      if (requestId) {
        request.setExternalId(requestId)
      }

      const response = await newAddress(request, metadata)
      return { address: response.getAddress() as OnChainAddress }
    } catch (err) {
      if (
        err &&
        typeof err === "object" &&
        "code" in err &&
        err?.code === status.ALREADY_EXISTS
      ) {
        return new OnChainAddressAlreadyCreatedForRequestIdError()
      }
      return new UnknownOnChainServiceError(err)
    }
  }

  const getAddressForSwap = async (): Promise<OnChainAddress | OnChainServiceError> => {
    try {
      const request = new NewAddressRequest()
      request.setWalletName(briaConfig.withdrawalWalletName)
      request.setMetadata(constructMetadata({ galoy: { swap: true } }))
      const response = await newAddress(request, metadata)
      return response.getAddress() as OnChainAddress
    } catch (err) {
      if (
        err &&
        typeof err === "object" &&
        "code" in err &&
        err?.code === status.ALREADY_EXISTS
      ) {
        return new OnChainAddressAlreadyCreatedForRequestIdError()
      }
      return new UnknownOnChainServiceError(err)
    }
  }

  const findAddressByRequestId = async (
    requestId: OnChainAddressRequestId,
  ): Promise<OnChainAddressIdentifier | OnChainServiceError> => {
    try {
      const request = new GetAddressRequest()
      request.setExternalId(requestId)

      const response = await getAddress(request, metadata)
      const foundAddress = response.getAddress()

      if (foundAddress === undefined) return new OnChainAddressNotFoundError()
      return {
        address: foundAddress as OnChainAddress,
      }
    } catch (err) {
      if (
        err &&
        typeof err === "object" &&
        "code" in err &&
        err.code == status.NOT_FOUND
      ) {
        return new OnChainAddressNotFoundError()
      }
      return new UnknownOnChainServiceError(err)
    }
  }

  const findPayoutByLedgerJournalId = async (
    journalId: LedgerJournalId,
  ): Promise<OnChainPayout | OnChainServiceError> => {
    try {
      const request = new GetPayoutRequest()
      request.setExternalId(journalId)

      const response = await getPayout(request, metadata)
      const foundPayout = response.getPayout()
      if (foundPayout === undefined) return new PayoutNotFoundError()

      //fix issue with proto gen default values
      const txId = (foundPayout.getTxId() as OnChainTxHash) || undefined
      return {
        id: foundPayout.getId() as PayoutId,
        journalId: foundPayout.getExternalId() as LedgerJournalId,
        batchInclusionEstimatedAt: foundPayout.getBatchInclusionEstimatedAt(),
        batchId: foundPayout.getBatchId() as BatchId,
        txId,
        vout: txId ? (foundPayout.getVout() as OnChainTxVout) : undefined,
      }
    } catch (err) {
      if (
        err &&
        typeof err === "object" &&
        "code" in err &&
        err.code == status.NOT_FOUND
      ) {
        return new PayoutNotFoundError()
      }
      return new UnknownOnChainServiceError(err)
    }
  }

  const listPayoutQueues = async (): Promise<PayoutQueue[] | OnChainServiceError> => {
    try {
      const request = new ListPayoutQueuesRequest()
      const response = await listPayoutQueuesGrpc(request, metadata)

      const briaQueues = response.getPayoutQueuesList()

      return briaConfig.payoutQueues.reduce<PayoutQueue[]>((queues, configQueue) => {
        const matched = briaQueues.find((bq) => bq.getName() === configQueue.queueName)
        if (!matched) return queues

        queues.push({
          ...configQueue,
          description: configQueue.description || matched.getDescription() || "",
        })

        return queues
      }, [])
    } catch (err) {
      const errMsg = parseErrorMessageFromUnknown(err)
      return new UnknownOnChainServiceError(errMsg)
    }
  }

  const queuePayoutToAddress = async ({
    walletDescriptor,
    address,
    amount,
    speed,
    journalId,
  }: QueuePayoutToAddressArgs): Promise<OnChainPayout | OnChainServiceError> => {
    try {
      const queueName = queueNameForSpeed(speed)
      if (queueName instanceof Error) return queueName

      const request = new SubmitPayoutRequest()
      request.setWalletName(briaConfig.withdrawalWalletName)
      request.setPayoutQueueName(queueName)
      request.setOnchainAddress(address)
      request.setSatoshis(Number(amount.amount))
      request.setExternalId(journalId)
      request.setMetadata(
        constructMetadata({ galoy: { walletDetails: walletDescriptor } }),
      )

      const response = await submitPayout(request, metadata)

      return {
        id: response.getId() as PayoutId,
        journalId,
        batchInclusionEstimatedAt: response.getBatchInclusionEstimatedAt(),
        batchId: undefined,
        txId: undefined,
        vout: undefined,
      }
    } catch (err) {
      const errMsg = parseErrorMessageFromUnknown(err)
      if (
        err &&
        typeof err === "object" &&
        "code" in err &&
        err.code == status.PERMISSION_DENIED &&
        errMsg.includes("DestinationBlocked")
      ) {
        return new PayoutDestinationBlocked()
      }
      return new UnknownOnChainServiceError(errMsg)
    }
  }

  const rebalanceToWithdrawalWallet = async ({
    amount,
  }: {
    amount: BtcPaymentAmount
  }): Promise<PayoutId | OnChainServiceError> => {
    const request = new SubmitPayoutRequest()
    const { payoutQueueName } = briaConfig.rebalances.receiveToWithdrawal
    request.setWalletName(briaConfig.receiveWalletName)
    request.setPayoutQueueName(payoutQueueName)
    request.setDestinationWalletName(briaConfig.withdrawalWalletName)
    request.setSatoshis(Number(amount.amount))
    request.setMetadata(constructMetadata({ galoy: { rebalance: true } }))

    try {
      const response = await submitPayout(request, metadata)

      return response.getId() as PayoutId
    } catch (err) {
      const errMsg = parseErrorMessageFromUnknown(err)
      return new UnknownOnChainServiceError(errMsg)
    }
  }

  const rebalanceToColdWallet = async ({
    amount,
  }: {
    amount: BtcPaymentAmount
  }): Promise<PayoutId | OnChainServiceError> => {
    const request = new SubmitPayoutRequest()
    const { payoutQueueName } = briaConfig.rebalances.hotToCold
    request.setWalletName(briaConfig.withdrawalWalletName)
    request.setPayoutQueueName(payoutQueueName)
    request.setDestinationWalletName(briaConfig.coldWalletName)
    request.setSatoshis(Number(amount.amount))
    request.setMetadata(constructMetadata({ galoy: { rebalanceToColdWallet: true } }))

    try {
      const response = await submitPayout(request, metadata)

      return response.getId() as PayoutId
    } catch (err) {
      const errMsg = parseErrorMessageFromUnknown(err)
      return new UnknownOnChainServiceError(errMsg)
    }
  }

  const estimateFeeForPayout = async ({
    address,
    amount,
    speed,
  }: EstimatePayoutFeeArgs): Promise<BtcPaymentAmount | OnChainServiceError> => {
    const estimate = async ({
      speed,
      address,
      amount,
    }: {
      speed: PayoutSpeed
      address: OnChainAddress
      amount: BtcPaymentAmount
    }): Promise<BtcPaymentAmount | BriaEventError> => {
      try {
        const queueName = queueNameForSpeed(speed)
        if (queueName instanceof Error) return queueName

        const request = new EstimatePayoutFeeRequest()
        request.setWalletName(briaConfig.withdrawalWalletName)
        request.setPayoutQueueName(queueName)
        request.setOnchainAddress(address)
        request.setSatoshis(Number(amount.amount))

        const response = await estimatePayoutFee(request, metadata)
        return paymentAmountFromNumber({
          amount: response.getSatoshis(),
          currency: WalletCurrency.Btc,
        })
      } catch (error) {
        return new UnknownOnChainServiceError(error)
      }
    }

    const payoutId = await estimate({ address, amount, speed })
    if (payoutId instanceof Error) return payoutId

    return payoutId
  }

  return wrapAsyncFunctionsToRunInSpan({
    namespace: "services.bria.onchain",
    fns: {
      getHotBalance,
      getReceiveWalletBalance,
      getWithdrawalWalletBalance,
      getWalletBalance,
      getColdBalance,
      getAddressForWallet,
      getAddressForSwap,
      findAddressByRequestId,
      findPayoutByLedgerJournalId,
      queuePayoutToAddress,
      rebalanceToWithdrawalWallet,
      rebalanceToColdWallet,
      estimateFeeForPayout,
      listPayoutQueues,
    },
  })
}

const constructMetadata = (metadataObj: JSONObject): Struct => {
  const metadata = new Struct()

  for (const key in metadataObj) {
    /* eslint-disable-next-line no-prototype-builtins */
    if (metadataObj.hasOwnProperty(key)) {
      const value = new Value()

      // Check the type of the value and set the appropriate field on the Value object
      const fieldValue = metadataObj[key]
      if (typeof fieldValue === "string") {
        value.setStringValue(fieldValue)
      } else if (typeof fieldValue === "number") {
        value.setNumberValue(fieldValue)
      } else if (typeof fieldValue === "boolean") {
        value.setBoolValue(fieldValue)
      } else if (Array.isArray(fieldValue)) {
        const listValue = new Value()
        listValue.setListValue(
          new ListValue().setValuesList(
            fieldValue.map((item) => {
              const listItemValue = new Value()
              listItemValue.setStringValue(`${item}`)
              return listItemValue
            }),
          ),
        )
        const fetchedListValue = listValue.getListValue()
        if (fetchedListValue !== undefined) {
          value.setListValue(fetchedListValue)
        }
      } else if (typeof fieldValue === "object") {
        value.setStructValue(constructMetadata(fieldValue as JSONObject))
      }

      metadata.getFieldsMap().set(key, value)
    }
  }

  return metadata
}
