import util from "util"

import { credentials } from "@grpc/grpc-js"

import { baseLogger } from "../logger"

import { QuoteServiceClient } from "./proto/services/quotes/v1/quote_service_grpc_pb"

import {
  GetQuoteToBuyUsdRequest,
  GetQuoteToBuyUsdResponse,
  GetQuoteToSellUsdRequest,
  GetQuoteToSellUsdResponse,
  AcceptQuoteRequest,
  AcceptQuoteResponse,
} from "./proto/services/quotes/v1/quote_service_pb"

import { QUOTE_SERVER_HOST, QUOTE_SERVER_PORT } from "@/config"

import { parseErrorMessageFromUnknown } from "@/domain/shared"

import { wrapAsyncFunctionsToRunInSpan } from "@/services/tracing"
import {
  DealerQuotesAppError,
  DealerQuoteServiceError,
  DealerQuotesServerError,
  NoConnectionToDealerError,
  UnknownDealerQuoteServiceError,
} from "@/domain/dealer-quote"
import {
  IDealerQuoteService,
  QuoteToBuyUsd,
  QuoteToSellUsd,
} from "@/domain/dealer-quote/index.types"

const client = new QuoteServiceClient(
  `${QUOTE_SERVER_HOST}:${QUOTE_SERVER_PORT}`,
  credentials.createInsecure(),
)

const clientGetQuoteToBuyUsd = util.promisify<
  GetQuoteToBuyUsdRequest,
  GetQuoteToBuyUsdResponse
>(client.getQuoteToBuyUsd.bind(client))

const clientGetQuoteToSellUsd = util.promisify<
  GetQuoteToSellUsdRequest,
  GetQuoteToSellUsdResponse
>(client.getQuoteToSellUsd.bind(client))

const clientAcceptQuote = util.promisify<AcceptQuoteRequest, AcceptQuoteResponse>(
  client.acceptQuote.bind(client),
)

export const DealerQuoteService = (): IDealerQuoteService => {
  const getQuoteToBuyUsdWithSats = async function (
    btcAmount: BtcPaymentAmount,
    immediateExecution: boolean = false,
  ): Promise<QuoteToBuyUsd | DealerQuoteServiceError> {
    try {
      const req = new GetQuoteToBuyUsdRequest().setAmountToSellInSats(
        Number(btcAmount.amount),
      )
      req.setImmediateExecution(immediateExecution)

      console.log("REQ: ", req)

      const response = await clientGetQuoteToBuyUsd(req)

      console.log("response: ", response)

      const quote = response.toObject() as QuoteToBuyUsd

      return quote
    } catch (error) {
      baseLogger.error({ error }, "GetQuoteToBuyUsdWithSats unable to fetch quote")
      return handleDealerErrors(error)
    }
  }

  const getQuoteToBuyUsdWithCents = async function (
    usdAmount: UsdPaymentAmount,
    immediateExecution = false,
  ): Promise<QuoteToBuyUsd | DealerQuoteServiceError> {
    try {
      const req = new GetQuoteToBuyUsdRequest().setAmountToBuyInCents(
        Number(usdAmount.amount),
      )
      req.setImmediateExecution(immediateExecution)

      console.log("REQ: ", req)

      const response = await clientGetQuoteToBuyUsd(req)

      console.log("response: ", response)

      const quote = response.toObject() as QuoteToBuyUsd

      return quote
    } catch (error) {
      baseLogger.error({ error }, "GetQuoteToBuyUsdWithCents unable to fetch quote")
      return handleDealerErrors(error)
    }
  }

  const getQuoteToSellUsdWithSats = async function (
    btcAmount: BtcPaymentAmount,
    immediateExecution = false,
  ): Promise<QuoteToSellUsd | DealerQuoteServiceError> {
    try {
      const req = new GetQuoteToSellUsdRequest().setAmountToBuyInSats(
        Number(btcAmount.amount),
      )
      req.setImmediateExecution(immediateExecution)

      const response = await clientGetQuoteToSellUsd(req)

      const quote = response.toObject() as QuoteToSellUsd

      return quote
    } catch (error) {
      baseLogger.error({ error }, "GetQuoteToSellUsdWithSats unable to fetch quote")
      return handleDealerErrors(error)
    }
  }

  const getQuoteToSellUsdWithCents = async function (
    usdAmount: UsdPaymentAmount,
    immediateExecution = false,
  ): Promise<QuoteToSellUsd | DealerQuoteServiceError> {
    try {
      const req = new GetQuoteToSellUsdRequest().setAmountToSellInCents(
        Number(usdAmount.amount),
      )
      req.setImmediateExecution(immediateExecution)

      const response = await clientGetQuoteToSellUsd(req)

      const quote = response.toObject() as QuoteToSellUsd

      return quote
    } catch (error) {
      baseLogger.error({ error }, "GetQuoteToSellUsdWithCents unable to fetch quote")
      return handleDealerErrors(error)
    }
  }

  const acceptQuote = async function (
    quoteId: string,
  ): Promise<void | DealerQuoteServiceError> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const response = await clientAcceptQuote(
        new AcceptQuoteRequest().setQuoteId(quoteId),
      )
      return
    } catch (error) {
      baseLogger.error({ error }, "AcceptQuote unable to accept quote")
      return handleDealerErrors(error)
    }
  }

  return wrapAsyncFunctionsToRunInSpan({
    namespace: "services.dealer-quote",
    spanAttributes: { ["slo.dealerCalled"]: "true" },
    fns: {
      getQuoteToBuyUsdWithSats,
      getQuoteToBuyUsdWithCents,

      getQuoteToSellUsdWithSats,
      getQuoteToSellUsdWithCents,

      acceptQuote,
    },
  })
}

const handleDealerErrors = (err: Error | string | unknown) => {
  const errMsg = parseErrorMessageFromUnknown(err)

  const match = (knownErrDetail: RegExp): boolean => knownErrDetail.test(errMsg)

  switch (true) {
    case match(KnownDealerErrorDetails.NoConnection):
      return new NoConnectionToDealerError(errMsg)

    case match(KnownDealerErrorDetails.QuotesApp):
      return new DealerQuotesAppError(errMsg)

    case match(KnownDealerErrorDetails.QuotesServer):
      return new DealerQuotesServerError(errMsg)

    default:
      return new UnknownDealerQuoteServiceError(errMsg)
  }
}

export const KnownDealerErrorDetails = {
  NoConnection: /No connection established/,
  QuotesApp: /QuotesAppError/,
  QuotesServer: /QuotesServerError/,
} as const
