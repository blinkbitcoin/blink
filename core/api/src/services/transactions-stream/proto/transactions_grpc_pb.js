// GENERATED CODE -- DO NOT EDIT!

'use strict';
var grpc = require('@grpc/grpc-js');
var transactions_pb = require('./transactions_pb.js');

function serialize_services_transactions_v1_SubscribeTransactionsRequest(arg) {
  if (!(arg instanceof transactions_pb.SubscribeTransactionsRequest)) {
    throw new Error('Expected argument of type services.transactions.v1.SubscribeTransactionsRequest');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_services_transactions_v1_SubscribeTransactionsRequest(buffer_arg) {
  return transactions_pb.SubscribeTransactionsRequest.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_services_transactions_v1_TransactionEvent(arg) {
  if (!(arg instanceof transactions_pb.TransactionEvent)) {
    throw new Error('Expected argument of type services.transactions.v1.TransactionEvent');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_services_transactions_v1_TransactionEvent(buffer_arg) {
  return transactions_pb.TransactionEvent.deserializeBinary(new Uint8Array(buffer_arg));
}


var TransactionsStreamService = exports.TransactionsStreamService = {
  subscribeTransactions: {
    path: '/services.transactions.v1.TransactionsStream/SubscribeTransactions',
    requestStream: false,
    responseStream: true,
    requestType: transactions_pb.SubscribeTransactionsRequest,
    responseType: transactions_pb.TransactionEvent,
    requestSerialize: serialize_services_transactions_v1_SubscribeTransactionsRequest,
    requestDeserialize: deserialize_services_transactions_v1_SubscribeTransactionsRequest,
    responseSerialize: serialize_services_transactions_v1_TransactionEvent,
    responseDeserialize: deserialize_services_transactions_v1_TransactionEvent,
  },
};

exports.TransactionsStreamClient = grpc.makeGenericClientConstructor(TransactionsStreamService, 'TransactionsStream');
