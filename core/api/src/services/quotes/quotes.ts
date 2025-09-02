import util from "util"

import { credentials } from "@grpc/grpc-js"

import { baseLogger } from "../logger"

import {
  convertGetQuoteToBuyUsdResponse,
  convertGetQuoteToSellUsdResponse,
} from "./helpers"

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
  QuotesServiceError,
  QuotesServerError,
  NoConnectionToQuotesError,
  UnknownQuotesServiceError,
  QuotesExchangePriceError,
  QuotesEntityError,
  QuotesAlreadyAcceptedError,
  QuotesExpiredError,
  QuotesCouldNotParseIdError,
  QuotesLedgerError,
} from "@/domain/quotes"
import {
  IQuotesService,
  QuoteToBuyUsd,
  QuoteToSellUsd,
} from "@/domain/quotes/index.types"

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

export const QuotesService = (): IQuotesService => {
  const getQuoteToBuyUsdWithSats = async function ({
    btcAmount,
    immediateExecution = false,
  }: {
    btcAmount: BtcPaymentAmount
    immediateExecution: boolean
  }): Promise<QuoteToBuyUsd | QuotesServiceError> {
    try {
      const req = new GetQuoteToBuyUsdRequest().setAmountToSellInSats(
        Number(btcAmount.amount),
      )
      req.setImmediateExecution(immediateExecution)

      const response = await clientGetQuoteToBuyUsd(req)

      return convertGetQuoteToBuyUsdResponse(response)
    } catch (error) {
      baseLogger.error({ error }, "GetQuoteToBuyUsdWithSats unable to fetch quote")
      return handleDealerErrors(error)
    }
  }

  const getQuoteToBuyUsdWithCents = async function ({
    usdAmount,
    immediateExecution = false,
  }: {
    usdAmount: UsdPaymentAmount
    immediateExecution: boolean
  }): Promise<QuoteToBuyUsd | QuotesServiceError> {
    try {
      const req = new GetQuoteToBuyUsdRequest().setAmountToBuyInCents(
        Number(usdAmount.amount),
      )
      req.setImmediateExecution(immediateExecution)

      const response = await clientGetQuoteToBuyUsd(req)

      return convertGetQuoteToBuyUsdResponse(response)
    } catch (error) {
      baseLogger.error({ error }, "GetQuoteToBuyUsdWithCents unable to fetch quote")
      return handleDealerErrors(error)
    }
  }

  const getQuoteToSellUsdWithSats = async function ({
    btcAmount,
    immediateExecution = false,
  }: {
    btcAmount: BtcPaymentAmount
    immediateExecution: boolean
  }): Promise<QuoteToSellUsd | QuotesServiceError> {
    try {
      const req = new GetQuoteToSellUsdRequest().setAmountToBuyInSats(
        Number(btcAmount.amount),
      )
      req.setImmediateExecution(immediateExecution)

      const response = await clientGetQuoteToSellUsd(req)

      return convertGetQuoteToSellUsdResponse(response)
    } catch (error) {
      baseLogger.error({ error }, "GetQuoteToSellUsdWithSats unable to fetch quote")
      return handleDealerErrors(error)
    }
  }

  const getQuoteToSellUsdWithCents = async function ({
    usdAmount,
    immediateExecution = false,
  }: {
    usdAmount: UsdPaymentAmount
    immediateExecution: boolean
  }): Promise<QuoteToSellUsd | QuotesServiceError> {
    try {
      const req = new GetQuoteToSellUsdRequest().setAmountToSellInCents(
        Number(usdAmount.amount),
      )
      req.setImmediateExecution(immediateExecution)

      const response = await clientGetQuoteToSellUsd(req)

      return convertGetQuoteToSellUsdResponse(response)
    } catch (error) {
      baseLogger.error({ error }, "GetQuoteToSellUsdWithCents unable to fetch quote")
      return handleDealerErrors(error)
    }
  }

  const acceptQuote = async function (
    quoteId: string,
  ): Promise<true | QuotesServiceError> {
    try {
      await clientAcceptQuote(new AcceptQuoteRequest().setQuoteId(quoteId))
      return true
    } catch (error) {
      baseLogger.error({ error }, "AcceptQuote unable to accept quote")
      return handleDealerErrors(error)
    }
  }

  return wrapAsyncFunctionsToRunInSpan({
    namespace: "services.dealer-quote",
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
      return new NoConnectionToQuotesError(errMsg)

    case match(KnownDealerErrorDetails.QuotesExchangePrice):
      return new QuotesExchangePriceError(errMsg)

    case match(KnownDealerErrorDetails.QuotesLedgerError):
      return new QuotesLedgerError(errMsg)

    case match(KnownDealerErrorDetails.QuotesEntityError):
      return new QuotesEntityError(errMsg)

    case match(KnownDealerErrorDetails.QuotesAlreadyAcceptedError):
      return new QuotesAlreadyAcceptedError(errMsg)

    case match(KnownDealerErrorDetails.QuotesExpiredError):
      return new QuotesExpiredError(errMsg)

    case match(KnownDealerErrorDetails.QuotesCouldNotParseIdError):
      return new QuotesCouldNotParseIdError(errMsg)

    case match(KnownDealerErrorDetails.QuotesServer):
      return new QuotesServerError(errMsg)

    default:
      return new UnknownQuotesServiceError(errMsg)
  }
}

export const KnownDealerErrorDetails = {
  NoConnection: /No connection established/,
  QuotesExchangePrice:
    /(?:StalePrice: last update was at|No price data available|OrderBook:)/,
  QuotesLedgerError: /Sqlx/,
  QuotesEntityError: /EntityError/,
  QuotesAlreadyAcceptedError: /already accepted/,
  QuotesExpiredError: /Quote has expired/,
  QuotesCouldNotParseIdError: /CouldNotParseIncomingUuid/,
  QuotesServer: /QuotesServerError/,
} as const
