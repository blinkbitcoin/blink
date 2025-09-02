// GENERATED CODE -- DO NOT EDIT!

'use strict';
var grpc = require('@grpc/grpc-js');
var services_quotes_v1_quote_service_pb = require('../../../services/quotes/v1/quote_service_pb.js');

function serialize_services_quotes_v1_AcceptQuoteRequest(arg) {
  if (!(arg instanceof services_quotes_v1_quote_service_pb.AcceptQuoteRequest)) {
    throw new Error('Expected argument of type services.quotes.v1.AcceptQuoteRequest');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_services_quotes_v1_AcceptQuoteRequest(buffer_arg) {
  return services_quotes_v1_quote_service_pb.AcceptQuoteRequest.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_services_quotes_v1_AcceptQuoteResponse(arg) {
  if (!(arg instanceof services_quotes_v1_quote_service_pb.AcceptQuoteResponse)) {
    throw new Error('Expected argument of type services.quotes.v1.AcceptQuoteResponse');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_services_quotes_v1_AcceptQuoteResponse(buffer_arg) {
  return services_quotes_v1_quote_service_pb.AcceptQuoteResponse.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_services_quotes_v1_GetQuoteToBuyUsdRequest(arg) {
  if (!(arg instanceof services_quotes_v1_quote_service_pb.GetQuoteToBuyUsdRequest)) {
    throw new Error('Expected argument of type services.quotes.v1.GetQuoteToBuyUsdRequest');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_services_quotes_v1_GetQuoteToBuyUsdRequest(buffer_arg) {
  return services_quotes_v1_quote_service_pb.GetQuoteToBuyUsdRequest.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_services_quotes_v1_GetQuoteToBuyUsdResponse(arg) {
  if (!(arg instanceof services_quotes_v1_quote_service_pb.GetQuoteToBuyUsdResponse)) {
    throw new Error('Expected argument of type services.quotes.v1.GetQuoteToBuyUsdResponse');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_services_quotes_v1_GetQuoteToBuyUsdResponse(buffer_arg) {
  return services_quotes_v1_quote_service_pb.GetQuoteToBuyUsdResponse.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_services_quotes_v1_GetQuoteToSellUsdRequest(arg) {
  if (!(arg instanceof services_quotes_v1_quote_service_pb.GetQuoteToSellUsdRequest)) {
    throw new Error('Expected argument of type services.quotes.v1.GetQuoteToSellUsdRequest');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_services_quotes_v1_GetQuoteToSellUsdRequest(buffer_arg) {
  return services_quotes_v1_quote_service_pb.GetQuoteToSellUsdRequest.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_services_quotes_v1_GetQuoteToSellUsdResponse(arg) {
  if (!(arg instanceof services_quotes_v1_quote_service_pb.GetQuoteToSellUsdResponse)) {
    throw new Error('Expected argument of type services.quotes.v1.GetQuoteToSellUsdResponse');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_services_quotes_v1_GetQuoteToSellUsdResponse(buffer_arg) {
  return services_quotes_v1_quote_service_pb.GetQuoteToSellUsdResponse.deserializeBinary(new Uint8Array(buffer_arg));
}


var QuoteServiceService = exports.QuoteServiceService = {
  getQuoteToBuyUsd: {
    path: '/services.quotes.v1.QuoteService/GetQuoteToBuyUsd',
    requestStream: false,
    responseStream: false,
    requestType: services_quotes_v1_quote_service_pb.GetQuoteToBuyUsdRequest,
    responseType: services_quotes_v1_quote_service_pb.GetQuoteToBuyUsdResponse,
    requestSerialize: serialize_services_quotes_v1_GetQuoteToBuyUsdRequest,
    requestDeserialize: deserialize_services_quotes_v1_GetQuoteToBuyUsdRequest,
    responseSerialize: serialize_services_quotes_v1_GetQuoteToBuyUsdResponse,
    responseDeserialize: deserialize_services_quotes_v1_GetQuoteToBuyUsdResponse,
  },
  getQuoteToSellUsd: {
    path: '/services.quotes.v1.QuoteService/GetQuoteToSellUsd',
    requestStream: false,
    responseStream: false,
    requestType: services_quotes_v1_quote_service_pb.GetQuoteToSellUsdRequest,
    responseType: services_quotes_v1_quote_service_pb.GetQuoteToSellUsdResponse,
    requestSerialize: serialize_services_quotes_v1_GetQuoteToSellUsdRequest,
    requestDeserialize: deserialize_services_quotes_v1_GetQuoteToSellUsdRequest,
    responseSerialize: serialize_services_quotes_v1_GetQuoteToSellUsdResponse,
    responseDeserialize: deserialize_services_quotes_v1_GetQuoteToSellUsdResponse,
  },
  acceptQuote: {
    path: '/services.quotes.v1.QuoteService/AcceptQuote',
    requestStream: false,
    responseStream: false,
    requestType: services_quotes_v1_quote_service_pb.AcceptQuoteRequest,
    responseType: services_quotes_v1_quote_service_pb.AcceptQuoteResponse,
    requestSerialize: serialize_services_quotes_v1_AcceptQuoteRequest,
    requestDeserialize: deserialize_services_quotes_v1_AcceptQuoteRequest,
    responseSerialize: serialize_services_quotes_v1_AcceptQuoteResponse,
    responseDeserialize: deserialize_services_quotes_v1_AcceptQuoteResponse,
  },
};

exports.QuoteServiceClient = grpc.makeGenericClientConstructor(QuoteServiceService, 'QuoteService');
