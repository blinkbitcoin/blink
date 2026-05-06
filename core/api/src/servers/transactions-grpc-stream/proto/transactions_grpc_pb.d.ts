// package: services.transactions.v1
// file: transactions.proto

/* tslint:disable */
/* eslint-disable */

import * as grpc from "@grpc/grpc-js";
import * as transactions_pb from "./transactions_pb";

interface ITransactionsStreamService extends grpc.ServiceDefinition<grpc.UntypedServiceImplementation> {
    subscribeTransactions: ITransactionsStreamService_ISubscribeTransactions;
}

interface ITransactionsStreamService_ISubscribeTransactions extends grpc.MethodDefinition<transactions_pb.SubscribeTransactionsRequest, transactions_pb.TransactionEvent> {
    path: "/services.transactions.v1.TransactionsStream/SubscribeTransactions";
    requestStream: false;
    responseStream: true;
    requestSerialize: grpc.serialize<transactions_pb.SubscribeTransactionsRequest>;
    requestDeserialize: grpc.deserialize<transactions_pb.SubscribeTransactionsRequest>;
    responseSerialize: grpc.serialize<transactions_pb.TransactionEvent>;
    responseDeserialize: grpc.deserialize<transactions_pb.TransactionEvent>;
}

export const TransactionsStreamService: ITransactionsStreamService;

export interface ITransactionsStreamServer extends grpc.UntypedServiceImplementation {
    subscribeTransactions: grpc.handleServerStreamingCall<transactions_pb.SubscribeTransactionsRequest, transactions_pb.TransactionEvent>;
}

export interface ITransactionsStreamClient {
    subscribeTransactions(request: transactions_pb.SubscribeTransactionsRequest, options?: Partial<grpc.CallOptions>): grpc.ClientReadableStream<transactions_pb.TransactionEvent>;
    subscribeTransactions(request: transactions_pb.SubscribeTransactionsRequest, metadata?: grpc.Metadata, options?: Partial<grpc.CallOptions>): grpc.ClientReadableStream<transactions_pb.TransactionEvent>;
}

export class TransactionsStreamClient extends grpc.Client implements ITransactionsStreamClient {
    constructor(address: string, credentials: grpc.ChannelCredentials, options?: Partial<grpc.ClientOptions>);
    public subscribeTransactions(request: transactions_pb.SubscribeTransactionsRequest, options?: Partial<grpc.CallOptions>): grpc.ClientReadableStream<transactions_pb.TransactionEvent>;
    public subscribeTransactions(request: transactions_pb.SubscribeTransactionsRequest, metadata?: grpc.Metadata, options?: Partial<grpc.CallOptions>): grpc.ClientReadableStream<transactions_pb.TransactionEvent>;
}
