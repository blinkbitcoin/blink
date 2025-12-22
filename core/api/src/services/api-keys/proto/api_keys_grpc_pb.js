// GENERATED CODE -- DO NOT EDIT!

'use strict';
var grpc = require('@grpc/grpc-js');
var api_keys_pb = require('./api_keys_pb.js');

function serialize_services_api_keys_v1_CheckSpendingLimitRequest(arg) {
  if (!(arg instanceof api_keys_pb.CheckSpendingLimitRequest)) {
    throw new Error('Expected argument of type services.api_keys.v1.CheckSpendingLimitRequest');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_services_api_keys_v1_CheckSpendingLimitRequest(buffer_arg) {
  return api_keys_pb.CheckSpendingLimitRequest.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_services_api_keys_v1_CheckSpendingLimitResponse(arg) {
  if (!(arg instanceof api_keys_pb.CheckSpendingLimitResponse)) {
    throw new Error('Expected argument of type services.api_keys.v1.CheckSpendingLimitResponse');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_services_api_keys_v1_CheckSpendingLimitResponse(buffer_arg) {
  return api_keys_pb.CheckSpendingLimitResponse.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_services_api_keys_v1_GetSpendingSummaryRequest(arg) {
  if (!(arg instanceof api_keys_pb.GetSpendingSummaryRequest)) {
    throw new Error('Expected argument of type services.api_keys.v1.GetSpendingSummaryRequest');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_services_api_keys_v1_GetSpendingSummaryRequest(buffer_arg) {
  return api_keys_pb.GetSpendingSummaryRequest.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_services_api_keys_v1_GetSpendingSummaryResponse(arg) {
  if (!(arg instanceof api_keys_pb.GetSpendingSummaryResponse)) {
    throw new Error('Expected argument of type services.api_keys.v1.GetSpendingSummaryResponse');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_services_api_keys_v1_GetSpendingSummaryResponse(buffer_arg) {
  return api_keys_pb.GetSpendingSummaryResponse.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_services_api_keys_v1_RecordSpendingRequest(arg) {
  if (!(arg instanceof api_keys_pb.RecordSpendingRequest)) {
    throw new Error('Expected argument of type services.api_keys.v1.RecordSpendingRequest');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_services_api_keys_v1_RecordSpendingRequest(buffer_arg) {
  return api_keys_pb.RecordSpendingRequest.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_services_api_keys_v1_RecordSpendingResponse(arg) {
  if (!(arg instanceof api_keys_pb.RecordSpendingResponse)) {
    throw new Error('Expected argument of type services.api_keys.v1.RecordSpendingResponse');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_services_api_keys_v1_RecordSpendingResponse(buffer_arg) {
  return api_keys_pb.RecordSpendingResponse.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_services_api_keys_v1_ReverseSpendingRequest(arg) {
  if (!(arg instanceof api_keys_pb.ReverseSpendingRequest)) {
    throw new Error('Expected argument of type services.api_keys.v1.ReverseSpendingRequest');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_services_api_keys_v1_ReverseSpendingRequest(buffer_arg) {
  return api_keys_pb.ReverseSpendingRequest.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_services_api_keys_v1_ReverseSpendingResponse(arg) {
  if (!(arg instanceof api_keys_pb.ReverseSpendingResponse)) {
    throw new Error('Expected argument of type services.api_keys.v1.ReverseSpendingResponse');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_services_api_keys_v1_ReverseSpendingResponse(buffer_arg) {
  return api_keys_pb.ReverseSpendingResponse.deserializeBinary(new Uint8Array(buffer_arg));
}


var ApiKeysServiceService = exports.ApiKeysServiceService = {
  checkSpendingLimit: {
    path: '/services.api_keys.v1.ApiKeysService/CheckSpendingLimit',
    requestStream: false,
    responseStream: false,
    requestType: api_keys_pb.CheckSpendingLimitRequest,
    responseType: api_keys_pb.CheckSpendingLimitResponse,
    requestSerialize: serialize_services_api_keys_v1_CheckSpendingLimitRequest,
    requestDeserialize: deserialize_services_api_keys_v1_CheckSpendingLimitRequest,
    responseSerialize: serialize_services_api_keys_v1_CheckSpendingLimitResponse,
    responseDeserialize: deserialize_services_api_keys_v1_CheckSpendingLimitResponse,
  },
  getSpendingSummary: {
    path: '/services.api_keys.v1.ApiKeysService/GetSpendingSummary',
    requestStream: false,
    responseStream: false,
    requestType: api_keys_pb.GetSpendingSummaryRequest,
    responseType: api_keys_pb.GetSpendingSummaryResponse,
    requestSerialize: serialize_services_api_keys_v1_GetSpendingSummaryRequest,
    requestDeserialize: deserialize_services_api_keys_v1_GetSpendingSummaryRequest,
    responseSerialize: serialize_services_api_keys_v1_GetSpendingSummaryResponse,
    responseDeserialize: deserialize_services_api_keys_v1_GetSpendingSummaryResponse,
  },
  recordSpending: {
    path: '/services.api_keys.v1.ApiKeysService/RecordSpending',
    requestStream: false,
    responseStream: false,
    requestType: api_keys_pb.RecordSpendingRequest,
    responseType: api_keys_pb.RecordSpendingResponse,
    requestSerialize: serialize_services_api_keys_v1_RecordSpendingRequest,
    requestDeserialize: deserialize_services_api_keys_v1_RecordSpendingRequest,
    responseSerialize: serialize_services_api_keys_v1_RecordSpendingResponse,
    responseDeserialize: deserialize_services_api_keys_v1_RecordSpendingResponse,
  },
  reverseSpending: {
    path: '/services.api_keys.v1.ApiKeysService/ReverseSpending',
    requestStream: false,
    responseStream: false,
    requestType: api_keys_pb.ReverseSpendingRequest,
    responseType: api_keys_pb.ReverseSpendingResponse,
    requestSerialize: serialize_services_api_keys_v1_ReverseSpendingRequest,
    requestDeserialize: deserialize_services_api_keys_v1_ReverseSpendingRequest,
    responseSerialize: serialize_services_api_keys_v1_ReverseSpendingResponse,
    responseDeserialize: deserialize_services_api_keys_v1_ReverseSpendingResponse,
  },
};

exports.ApiKeysServiceClient = grpc.makeGenericClientConstructor(ApiKeysServiceService, 'ApiKeysService');
