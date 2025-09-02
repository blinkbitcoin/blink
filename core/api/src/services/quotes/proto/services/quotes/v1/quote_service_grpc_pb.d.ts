// package: services.quotes.v1
// file: services/quotes/v1/quote_service.proto

/* tslint:disable */
/* eslint-disable */

import * as grpc from "@grpc/grpc-js"
import * as services_quotes_v1_quote_service_pb from "./quote_service_pb"

interface IQuoteServiceService
  extends grpc.ServiceDefinition<grpc.UntypedServiceImplementation> {
  getQuoteToBuyUsd: IQuoteServiceService_IGetQuoteToBuyUsd
  getQuoteToSellUsd: IQuoteServiceService_IGetQuoteToSellUsd
  acceptQuote: IQuoteServiceService_IAcceptQuote
}

interface IQuoteServiceService_IGetQuoteToBuyUsd
  extends grpc.MethodDefinition<
    services_quotes_v1_quote_service_pb.GetQuoteToBuyUsdRequest,
    services_quotes_v1_quote_service_pb.GetQuoteToBuyUsdResponse
  > {
  path: "/services.quotes.v1.QuoteService/GetQuoteToBuyUsd"
  requestStream: false
  responseStream: false
  requestSerialize: grpc.serialize<services_quotes_v1_quote_service_pb.GetQuoteToBuyUsdRequest>
  requestDeserialize: grpc.deserialize<services_quotes_v1_quote_service_pb.GetQuoteToBuyUsdRequest>
  responseSerialize: grpc.serialize<services_quotes_v1_quote_service_pb.GetQuoteToBuyUsdResponse>
  responseDeserialize: grpc.deserialize<services_quotes_v1_quote_service_pb.GetQuoteToBuyUsdResponse>
}
interface IQuoteServiceService_IGetQuoteToSellUsd
  extends grpc.MethodDefinition<
    services_quotes_v1_quote_service_pb.GetQuoteToSellUsdRequest,
    services_quotes_v1_quote_service_pb.GetQuoteToSellUsdResponse
  > {
  path: "/services.quotes.v1.QuoteService/GetQuoteToSellUsd"
  requestStream: false
  responseStream: false
  requestSerialize: grpc.serialize<services_quotes_v1_quote_service_pb.GetQuoteToSellUsdRequest>
  requestDeserialize: grpc.deserialize<services_quotes_v1_quote_service_pb.GetQuoteToSellUsdRequest>
  responseSerialize: grpc.serialize<services_quotes_v1_quote_service_pb.GetQuoteToSellUsdResponse>
  responseDeserialize: grpc.deserialize<services_quotes_v1_quote_service_pb.GetQuoteToSellUsdResponse>
}
interface IQuoteServiceService_IAcceptQuote
  extends grpc.MethodDefinition<
    services_quotes_v1_quote_service_pb.AcceptQuoteRequest,
    services_quotes_v1_quote_service_pb.AcceptQuoteResponse
  > {
  path: "/services.quotes.v1.QuoteService/AcceptQuote"
  requestStream: false
  responseStream: false
  requestSerialize: grpc.serialize<services_quotes_v1_quote_service_pb.AcceptQuoteRequest>
  requestDeserialize: grpc.deserialize<services_quotes_v1_quote_service_pb.AcceptQuoteRequest>
  responseSerialize: grpc.serialize<services_quotes_v1_quote_service_pb.AcceptQuoteResponse>
  responseDeserialize: grpc.deserialize<services_quotes_v1_quote_service_pb.AcceptQuoteResponse>
}

export const QuoteServiceService: IQuoteServiceService

export interface IQuoteServiceServer extends grpc.UntypedServiceImplementation {
  getQuoteToBuyUsd: grpc.handleUnaryCall<
    services_quotes_v1_quote_service_pb.GetQuoteToBuyUsdRequest,
    services_quotes_v1_quote_service_pb.GetQuoteToBuyUsdResponse
  >
  getQuoteToSellUsd: grpc.handleUnaryCall<
    services_quotes_v1_quote_service_pb.GetQuoteToSellUsdRequest,
    services_quotes_v1_quote_service_pb.GetQuoteToSellUsdResponse
  >
  acceptQuote: grpc.handleUnaryCall<
    services_quotes_v1_quote_service_pb.AcceptQuoteRequest,
    services_quotes_v1_quote_service_pb.AcceptQuoteResponse
  >
}

export interface IQuoteServiceClient {
  getQuoteToBuyUsd(
    request: services_quotes_v1_quote_service_pb.GetQuoteToBuyUsdRequest,
    callback: (
      error: grpc.ServiceError | null,
      response: services_quotes_v1_quote_service_pb.GetQuoteToBuyUsdResponse,
    ) => void,
  ): grpc.ClientUnaryCall
  getQuoteToBuyUsd(
    request: services_quotes_v1_quote_service_pb.GetQuoteToBuyUsdRequest,
    metadata: grpc.Metadata,
    callback: (
      error: grpc.ServiceError | null,
      response: services_quotes_v1_quote_service_pb.GetQuoteToBuyUsdResponse,
    ) => void,
  ): grpc.ClientUnaryCall
  getQuoteToBuyUsd(
    request: services_quotes_v1_quote_service_pb.GetQuoteToBuyUsdRequest,
    metadata: grpc.Metadata,
    options: Partial<grpc.CallOptions>,
    callback: (
      error: grpc.ServiceError | null,
      response: services_quotes_v1_quote_service_pb.GetQuoteToBuyUsdResponse,
    ) => void,
  ): grpc.ClientUnaryCall
  getQuoteToSellUsd(
    request: services_quotes_v1_quote_service_pb.GetQuoteToSellUsdRequest,
    callback: (
      error: grpc.ServiceError | null,
      response: services_quotes_v1_quote_service_pb.GetQuoteToSellUsdResponse,
    ) => void,
  ): grpc.ClientUnaryCall
  getQuoteToSellUsd(
    request: services_quotes_v1_quote_service_pb.GetQuoteToSellUsdRequest,
    metadata: grpc.Metadata,
    callback: (
      error: grpc.ServiceError | null,
      response: services_quotes_v1_quote_service_pb.GetQuoteToSellUsdResponse,
    ) => void,
  ): grpc.ClientUnaryCall
  getQuoteToSellUsd(
    request: services_quotes_v1_quote_service_pb.GetQuoteToSellUsdRequest,
    metadata: grpc.Metadata,
    options: Partial<grpc.CallOptions>,
    callback: (
      error: grpc.ServiceError | null,
      response: services_quotes_v1_quote_service_pb.GetQuoteToSellUsdResponse,
    ) => void,
  ): grpc.ClientUnaryCall
  acceptQuote(
    request: services_quotes_v1_quote_service_pb.AcceptQuoteRequest,
    callback: (
      error: grpc.ServiceError | null,
      response: services_quotes_v1_quote_service_pb.AcceptQuoteResponse,
    ) => void,
  ): grpc.ClientUnaryCall
  acceptQuote(
    request: services_quotes_v1_quote_service_pb.AcceptQuoteRequest,
    metadata: grpc.Metadata,
    callback: (
      error: grpc.ServiceError | null,
      response: services_quotes_v1_quote_service_pb.AcceptQuoteResponse,
    ) => void,
  ): grpc.ClientUnaryCall
  acceptQuote(
    request: services_quotes_v1_quote_service_pb.AcceptQuoteRequest,
    metadata: grpc.Metadata,
    options: Partial<grpc.CallOptions>,
    callback: (
      error: grpc.ServiceError | null,
      response: services_quotes_v1_quote_service_pb.AcceptQuoteResponse,
    ) => void,
  ): grpc.ClientUnaryCall
}

export class QuoteServiceClient extends grpc.Client implements IQuoteServiceClient {
  constructor(
    address: string,
    credentials: grpc.ChannelCredentials,
    options?: Partial<grpc.ClientOptions>,
  )
  public getQuoteToBuyUsd(
    request: services_quotes_v1_quote_service_pb.GetQuoteToBuyUsdRequest,
    callback: (
      error: grpc.ServiceError | null,
      response: services_quotes_v1_quote_service_pb.GetQuoteToBuyUsdResponse,
    ) => void,
  ): grpc.ClientUnaryCall
  public getQuoteToBuyUsd(
    request: services_quotes_v1_quote_service_pb.GetQuoteToBuyUsdRequest,
    metadata: grpc.Metadata,
    callback: (
      error: grpc.ServiceError | null,
      response: services_quotes_v1_quote_service_pb.GetQuoteToBuyUsdResponse,
    ) => void,
  ): grpc.ClientUnaryCall
  public getQuoteToBuyUsd(
    request: services_quotes_v1_quote_service_pb.GetQuoteToBuyUsdRequest,
    metadata: grpc.Metadata,
    options: Partial<grpc.CallOptions>,
    callback: (
      error: grpc.ServiceError | null,
      response: services_quotes_v1_quote_service_pb.GetQuoteToBuyUsdResponse,
    ) => void,
  ): grpc.ClientUnaryCall
  public getQuoteToSellUsd(
    request: services_quotes_v1_quote_service_pb.GetQuoteToSellUsdRequest,
    callback: (
      error: grpc.ServiceError | null,
      response: services_quotes_v1_quote_service_pb.GetQuoteToSellUsdResponse,
    ) => void,
  ): grpc.ClientUnaryCall
  public getQuoteToSellUsd(
    request: services_quotes_v1_quote_service_pb.GetQuoteToSellUsdRequest,
    metadata: grpc.Metadata,
    callback: (
      error: grpc.ServiceError | null,
      response: services_quotes_v1_quote_service_pb.GetQuoteToSellUsdResponse,
    ) => void,
  ): grpc.ClientUnaryCall
  public getQuoteToSellUsd(
    request: services_quotes_v1_quote_service_pb.GetQuoteToSellUsdRequest,
    metadata: grpc.Metadata,
    options: Partial<grpc.CallOptions>,
    callback: (
      error: grpc.ServiceError | null,
      response: services_quotes_v1_quote_service_pb.GetQuoteToSellUsdResponse,
    ) => void,
  ): grpc.ClientUnaryCall
  public acceptQuote(
    request: services_quotes_v1_quote_service_pb.AcceptQuoteRequest,
    callback: (
      error: grpc.ServiceError | null,
      response: services_quotes_v1_quote_service_pb.AcceptQuoteResponse,
    ) => void,
  ): grpc.ClientUnaryCall
  public acceptQuote(
    request: services_quotes_v1_quote_service_pb.AcceptQuoteRequest,
    metadata: grpc.Metadata,
    callback: (
      error: grpc.ServiceError | null,
      response: services_quotes_v1_quote_service_pb.AcceptQuoteResponse,
    ) => void,
  ): grpc.ClientUnaryCall
  public acceptQuote(
    request: services_quotes_v1_quote_service_pb.AcceptQuoteRequest,
    metadata: grpc.Metadata,
    options: Partial<grpc.CallOptions>,
    callback: (
      error: grpc.ServiceError | null,
      response: services_quotes_v1_quote_service_pb.AcceptQuoteResponse,
    ) => void,
  ): grpc.ClientUnaryCall
}
