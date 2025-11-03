// package: services.api_keys.v1
// file: api_keys.proto

/* tslint:disable */
/* eslint-disable */

import * as jspb from "google-protobuf";

export class CheckSpendingLimitRequest extends jspb.Message { 
    getApiKeyId(): string;
    setApiKeyId(value: string): CheckSpendingLimitRequest;
    getAmountSats(): number;
    setAmountSats(value: number): CheckSpendingLimitRequest;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): CheckSpendingLimitRequest.AsObject;
    static toObject(includeInstance: boolean, msg: CheckSpendingLimitRequest): CheckSpendingLimitRequest.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: CheckSpendingLimitRequest, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): CheckSpendingLimitRequest;
    static deserializeBinaryFromReader(message: CheckSpendingLimitRequest, reader: jspb.BinaryReader): CheckSpendingLimitRequest;
}

export namespace CheckSpendingLimitRequest {
    export type AsObject = {
        apiKeyId: string,
        amountSats: number,
    }
}

export class CheckSpendingLimitResponse extends jspb.Message { 
    getAllowed(): boolean;
    setAllowed(value: boolean): CheckSpendingLimitResponse;

    hasDailyLimitSats(): boolean;
    clearDailyLimitSats(): void;
    getDailyLimitSats(): number | undefined;
    setDailyLimitSats(value: number): CheckSpendingLimitResponse;

    hasWeeklyLimitSats(): boolean;
    clearWeeklyLimitSats(): void;
    getWeeklyLimitSats(): number | undefined;
    setWeeklyLimitSats(value: number): CheckSpendingLimitResponse;

    hasMonthlyLimitSats(): boolean;
    clearMonthlyLimitSats(): void;
    getMonthlyLimitSats(): number | undefined;
    setMonthlyLimitSats(value: number): CheckSpendingLimitResponse;

    hasAnnualLimitSats(): boolean;
    clearAnnualLimitSats(): void;
    getAnnualLimitSats(): number | undefined;
    setAnnualLimitSats(value: number): CheckSpendingLimitResponse;
    getSpentLast24hSats(): number;
    setSpentLast24hSats(value: number): CheckSpendingLimitResponse;
    getSpentLast7dSats(): number;
    setSpentLast7dSats(value: number): CheckSpendingLimitResponse;
    getSpentLast30dSats(): number;
    setSpentLast30dSats(value: number): CheckSpendingLimitResponse;
    getSpentLast365dSats(): number;
    setSpentLast365dSats(value: number): CheckSpendingLimitResponse;

    hasRemainingDailySats(): boolean;
    clearRemainingDailySats(): void;
    getRemainingDailySats(): number | undefined;
    setRemainingDailySats(value: number): CheckSpendingLimitResponse;

    hasRemainingWeeklySats(): boolean;
    clearRemainingWeeklySats(): void;
    getRemainingWeeklySats(): number | undefined;
    setRemainingWeeklySats(value: number): CheckSpendingLimitResponse;

    hasRemainingMonthlySats(): boolean;
    clearRemainingMonthlySats(): void;
    getRemainingMonthlySats(): number | undefined;
    setRemainingMonthlySats(value: number): CheckSpendingLimitResponse;

    hasRemainingAnnualSats(): boolean;
    clearRemainingAnnualSats(): void;
    getRemainingAnnualSats(): number | undefined;
    setRemainingAnnualSats(value: number): CheckSpendingLimitResponse;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): CheckSpendingLimitResponse.AsObject;
    static toObject(includeInstance: boolean, msg: CheckSpendingLimitResponse): CheckSpendingLimitResponse.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: CheckSpendingLimitResponse, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): CheckSpendingLimitResponse;
    static deserializeBinaryFromReader(message: CheckSpendingLimitResponse, reader: jspb.BinaryReader): CheckSpendingLimitResponse;
}

export namespace CheckSpendingLimitResponse {
    export type AsObject = {
        allowed: boolean,
        dailyLimitSats?: number,
        weeklyLimitSats?: number,
        monthlyLimitSats?: number,
        annualLimitSats?: number,
        spentLast24hSats: number,
        spentLast7dSats: number,
        spentLast30dSats: number,
        spentLast365dSats: number,
        remainingDailySats?: number,
        remainingWeeklySats?: number,
        remainingMonthlySats?: number,
        remainingAnnualSats?: number,
    }
}

export class GetSpendingSummaryRequest extends jspb.Message { 
    getApiKeyId(): string;
    setApiKeyId(value: string): GetSpendingSummaryRequest;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): GetSpendingSummaryRequest.AsObject;
    static toObject(includeInstance: boolean, msg: GetSpendingSummaryRequest): GetSpendingSummaryRequest.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: GetSpendingSummaryRequest, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): GetSpendingSummaryRequest;
    static deserializeBinaryFromReader(message: GetSpendingSummaryRequest, reader: jspb.BinaryReader): GetSpendingSummaryRequest;
}

export namespace GetSpendingSummaryRequest {
    export type AsObject = {
        apiKeyId: string,
    }
}

export class GetSpendingSummaryResponse extends jspb.Message { 

    hasDailyLimitSats(): boolean;
    clearDailyLimitSats(): void;
    getDailyLimitSats(): number | undefined;
    setDailyLimitSats(value: number): GetSpendingSummaryResponse;

    hasWeeklyLimitSats(): boolean;
    clearWeeklyLimitSats(): void;
    getWeeklyLimitSats(): number | undefined;
    setWeeklyLimitSats(value: number): GetSpendingSummaryResponse;

    hasMonthlyLimitSats(): boolean;
    clearMonthlyLimitSats(): void;
    getMonthlyLimitSats(): number | undefined;
    setMonthlyLimitSats(value: number): GetSpendingSummaryResponse;

    hasAnnualLimitSats(): boolean;
    clearAnnualLimitSats(): void;
    getAnnualLimitSats(): number | undefined;
    setAnnualLimitSats(value: number): GetSpendingSummaryResponse;
    getSpentLast24hSats(): number;
    setSpentLast24hSats(value: number): GetSpendingSummaryResponse;
    getSpentLast7dSats(): number;
    setSpentLast7dSats(value: number): GetSpendingSummaryResponse;
    getSpentLast30dSats(): number;
    setSpentLast30dSats(value: number): GetSpendingSummaryResponse;
    getSpentLast365dSats(): number;
    setSpentLast365dSats(value: number): GetSpendingSummaryResponse;

    hasRemainingDailySats(): boolean;
    clearRemainingDailySats(): void;
    getRemainingDailySats(): number | undefined;
    setRemainingDailySats(value: number): GetSpendingSummaryResponse;

    hasRemainingWeeklySats(): boolean;
    clearRemainingWeeklySats(): void;
    getRemainingWeeklySats(): number | undefined;
    setRemainingWeeklySats(value: number): GetSpendingSummaryResponse;

    hasRemainingMonthlySats(): boolean;
    clearRemainingMonthlySats(): void;
    getRemainingMonthlySats(): number | undefined;
    setRemainingMonthlySats(value: number): GetSpendingSummaryResponse;

    hasRemainingAnnualSats(): boolean;
    clearRemainingAnnualSats(): void;
    getRemainingAnnualSats(): number | undefined;
    setRemainingAnnualSats(value: number): GetSpendingSummaryResponse;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): GetSpendingSummaryResponse.AsObject;
    static toObject(includeInstance: boolean, msg: GetSpendingSummaryResponse): GetSpendingSummaryResponse.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: GetSpendingSummaryResponse, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): GetSpendingSummaryResponse;
    static deserializeBinaryFromReader(message: GetSpendingSummaryResponse, reader: jspb.BinaryReader): GetSpendingSummaryResponse;
}

export namespace GetSpendingSummaryResponse {
    export type AsObject = {
        dailyLimitSats?: number,
        weeklyLimitSats?: number,
        monthlyLimitSats?: number,
        annualLimitSats?: number,
        spentLast24hSats: number,
        spentLast7dSats: number,
        spentLast30dSats: number,
        spentLast365dSats: number,
        remainingDailySats?: number,
        remainingWeeklySats?: number,
        remainingMonthlySats?: number,
        remainingAnnualSats?: number,
    }
}

export class RecordSpendingRequest extends jspb.Message { 
    getApiKeyId(): string;
    setApiKeyId(value: string): RecordSpendingRequest;
    getAmountSats(): number;
    setAmountSats(value: number): RecordSpendingRequest;

    hasTransactionId(): boolean;
    clearTransactionId(): void;
    getTransactionId(): string | undefined;
    setTransactionId(value: string): RecordSpendingRequest;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): RecordSpendingRequest.AsObject;
    static toObject(includeInstance: boolean, msg: RecordSpendingRequest): RecordSpendingRequest.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: RecordSpendingRequest, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): RecordSpendingRequest;
    static deserializeBinaryFromReader(message: RecordSpendingRequest, reader: jspb.BinaryReader): RecordSpendingRequest;
}

export namespace RecordSpendingRequest {
    export type AsObject = {
        apiKeyId: string,
        amountSats: number,
        transactionId?: string,
    }
}

export class RecordSpendingResponse extends jspb.Message { 

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): RecordSpendingResponse.AsObject;
    static toObject(includeInstance: boolean, msg: RecordSpendingResponse): RecordSpendingResponse.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: RecordSpendingResponse, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): RecordSpendingResponse;
    static deserializeBinaryFromReader(message: RecordSpendingResponse, reader: jspb.BinaryReader): RecordSpendingResponse;
}

export namespace RecordSpendingResponse {
    export type AsObject = {
    }
}
