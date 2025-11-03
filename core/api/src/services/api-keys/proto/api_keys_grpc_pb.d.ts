// package: services.api_keys.v1
// file: api_keys.proto

/* tslint:disable */
/* eslint-disable */

import * as grpc from "@grpc/grpc-js";
import * as api_keys_pb from "./api_keys_pb";

interface IApiKeysServiceService extends grpc.ServiceDefinition<grpc.UntypedServiceImplementation> {
    checkSpendingLimit: IApiKeysServiceService_ICheckSpendingLimit;
    getSpendingSummary: IApiKeysServiceService_IGetSpendingSummary;
    recordSpending: IApiKeysServiceService_IRecordSpending;
}

interface IApiKeysServiceService_ICheckSpendingLimit extends grpc.MethodDefinition<api_keys_pb.CheckSpendingLimitRequest, api_keys_pb.CheckSpendingLimitResponse> {
    path: "/services.api_keys.v1.ApiKeysService/CheckSpendingLimit";
    requestStream: false;
    responseStream: false;
    requestSerialize: grpc.serialize<api_keys_pb.CheckSpendingLimitRequest>;
    requestDeserialize: grpc.deserialize<api_keys_pb.CheckSpendingLimitRequest>;
    responseSerialize: grpc.serialize<api_keys_pb.CheckSpendingLimitResponse>;
    responseDeserialize: grpc.deserialize<api_keys_pb.CheckSpendingLimitResponse>;
}
interface IApiKeysServiceService_IGetSpendingSummary extends grpc.MethodDefinition<api_keys_pb.GetSpendingSummaryRequest, api_keys_pb.GetSpendingSummaryResponse> {
    path: "/services.api_keys.v1.ApiKeysService/GetSpendingSummary";
    requestStream: false;
    responseStream: false;
    requestSerialize: grpc.serialize<api_keys_pb.GetSpendingSummaryRequest>;
    requestDeserialize: grpc.deserialize<api_keys_pb.GetSpendingSummaryRequest>;
    responseSerialize: grpc.serialize<api_keys_pb.GetSpendingSummaryResponse>;
    responseDeserialize: grpc.deserialize<api_keys_pb.GetSpendingSummaryResponse>;
}
interface IApiKeysServiceService_IRecordSpending extends grpc.MethodDefinition<api_keys_pb.RecordSpendingRequest, api_keys_pb.RecordSpendingResponse> {
    path: "/services.api_keys.v1.ApiKeysService/RecordSpending";
    requestStream: false;
    responseStream: false;
    requestSerialize: grpc.serialize<api_keys_pb.RecordSpendingRequest>;
    requestDeserialize: grpc.deserialize<api_keys_pb.RecordSpendingRequest>;
    responseSerialize: grpc.serialize<api_keys_pb.RecordSpendingResponse>;
    responseDeserialize: grpc.deserialize<api_keys_pb.RecordSpendingResponse>;
}

export const ApiKeysServiceService: IApiKeysServiceService;

export interface IApiKeysServiceServer extends grpc.UntypedServiceImplementation {
    checkSpendingLimit: grpc.handleUnaryCall<api_keys_pb.CheckSpendingLimitRequest, api_keys_pb.CheckSpendingLimitResponse>;
    getSpendingSummary: grpc.handleUnaryCall<api_keys_pb.GetSpendingSummaryRequest, api_keys_pb.GetSpendingSummaryResponse>;
    recordSpending: grpc.handleUnaryCall<api_keys_pb.RecordSpendingRequest, api_keys_pb.RecordSpendingResponse>;
}

export interface IApiKeysServiceClient {
    checkSpendingLimit(request: api_keys_pb.CheckSpendingLimitRequest, callback: (error: grpc.ServiceError | null, response: api_keys_pb.CheckSpendingLimitResponse) => void): grpc.ClientUnaryCall;
    checkSpendingLimit(request: api_keys_pb.CheckSpendingLimitRequest, metadata: grpc.Metadata, callback: (error: grpc.ServiceError | null, response: api_keys_pb.CheckSpendingLimitResponse) => void): grpc.ClientUnaryCall;
    checkSpendingLimit(request: api_keys_pb.CheckSpendingLimitRequest, metadata: grpc.Metadata, options: Partial<grpc.CallOptions>, callback: (error: grpc.ServiceError | null, response: api_keys_pb.CheckSpendingLimitResponse) => void): grpc.ClientUnaryCall;
    getSpendingSummary(request: api_keys_pb.GetSpendingSummaryRequest, callback: (error: grpc.ServiceError | null, response: api_keys_pb.GetSpendingSummaryResponse) => void): grpc.ClientUnaryCall;
    getSpendingSummary(request: api_keys_pb.GetSpendingSummaryRequest, metadata: grpc.Metadata, callback: (error: grpc.ServiceError | null, response: api_keys_pb.GetSpendingSummaryResponse) => void): grpc.ClientUnaryCall;
    getSpendingSummary(request: api_keys_pb.GetSpendingSummaryRequest, metadata: grpc.Metadata, options: Partial<grpc.CallOptions>, callback: (error: grpc.ServiceError | null, response: api_keys_pb.GetSpendingSummaryResponse) => void): grpc.ClientUnaryCall;
    recordSpending(request: api_keys_pb.RecordSpendingRequest, callback: (error: grpc.ServiceError | null, response: api_keys_pb.RecordSpendingResponse) => void): grpc.ClientUnaryCall;
    recordSpending(request: api_keys_pb.RecordSpendingRequest, metadata: grpc.Metadata, callback: (error: grpc.ServiceError | null, response: api_keys_pb.RecordSpendingResponse) => void): grpc.ClientUnaryCall;
    recordSpending(request: api_keys_pb.RecordSpendingRequest, metadata: grpc.Metadata, options: Partial<grpc.CallOptions>, callback: (error: grpc.ServiceError | null, response: api_keys_pb.RecordSpendingResponse) => void): grpc.ClientUnaryCall;
}

export class ApiKeysServiceClient extends grpc.Client implements IApiKeysServiceClient {
    constructor(address: string, credentials: grpc.ChannelCredentials, options?: Partial<grpc.ClientOptions>);
    public checkSpendingLimit(request: api_keys_pb.CheckSpendingLimitRequest, callback: (error: grpc.ServiceError | null, response: api_keys_pb.CheckSpendingLimitResponse) => void): grpc.ClientUnaryCall;
    public checkSpendingLimit(request: api_keys_pb.CheckSpendingLimitRequest, metadata: grpc.Metadata, callback: (error: grpc.ServiceError | null, response: api_keys_pb.CheckSpendingLimitResponse) => void): grpc.ClientUnaryCall;
    public checkSpendingLimit(request: api_keys_pb.CheckSpendingLimitRequest, metadata: grpc.Metadata, options: Partial<grpc.CallOptions>, callback: (error: grpc.ServiceError | null, response: api_keys_pb.CheckSpendingLimitResponse) => void): grpc.ClientUnaryCall;
    public getSpendingSummary(request: api_keys_pb.GetSpendingSummaryRequest, callback: (error: grpc.ServiceError | null, response: api_keys_pb.GetSpendingSummaryResponse) => void): grpc.ClientUnaryCall;
    public getSpendingSummary(request: api_keys_pb.GetSpendingSummaryRequest, metadata: grpc.Metadata, callback: (error: grpc.ServiceError | null, response: api_keys_pb.GetSpendingSummaryResponse) => void): grpc.ClientUnaryCall;
    public getSpendingSummary(request: api_keys_pb.GetSpendingSummaryRequest, metadata: grpc.Metadata, options: Partial<grpc.CallOptions>, callback: (error: grpc.ServiceError | null, response: api_keys_pb.GetSpendingSummaryResponse) => void): grpc.ClientUnaryCall;
    public recordSpending(request: api_keys_pb.RecordSpendingRequest, callback: (error: grpc.ServiceError | null, response: api_keys_pb.RecordSpendingResponse) => void): grpc.ClientUnaryCall;
    public recordSpending(request: api_keys_pb.RecordSpendingRequest, metadata: grpc.Metadata, callback: (error: grpc.ServiceError | null, response: api_keys_pb.RecordSpendingResponse) => void): grpc.ClientUnaryCall;
    public recordSpending(request: api_keys_pb.RecordSpendingRequest, metadata: grpc.Metadata, options: Partial<grpc.CallOptions>, callback: (error: grpc.ServiceError | null, response: api_keys_pb.RecordSpendingResponse) => void): grpc.ClientUnaryCall;
}
