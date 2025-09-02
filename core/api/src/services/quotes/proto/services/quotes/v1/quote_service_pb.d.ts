// package: services.quotes.v1
// file: services/quotes/v1/quote_service.proto

/* tslint:disable */
/* eslint-disable */

import * as jspb from "google-protobuf";

export class GetQuoteToBuyUsdRequest extends jspb.Message { 

    hasAmountToSellInSats(): boolean;
    clearAmountToSellInSats(): void;
    getAmountToSellInSats(): number;
    setAmountToSellInSats(value: number): GetQuoteToBuyUsdRequest;

    hasAmountToBuyInCents(): boolean;
    clearAmountToBuyInCents(): void;
    getAmountToBuyInCents(): number;
    setAmountToBuyInCents(value: number): GetQuoteToBuyUsdRequest;
    getImmediateExecution(): boolean;
    setImmediateExecution(value: boolean): GetQuoteToBuyUsdRequest;

    getQuoteForCase(): GetQuoteToBuyUsdRequest.QuoteForCase;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): GetQuoteToBuyUsdRequest.AsObject;
    static toObject(includeInstance: boolean, msg: GetQuoteToBuyUsdRequest): GetQuoteToBuyUsdRequest.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: GetQuoteToBuyUsdRequest, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): GetQuoteToBuyUsdRequest;
    static deserializeBinaryFromReader(message: GetQuoteToBuyUsdRequest, reader: jspb.BinaryReader): GetQuoteToBuyUsdRequest;
}

export namespace GetQuoteToBuyUsdRequest {
    export type AsObject = {
        amountToSellInSats: number,
        amountToBuyInCents: number,
        immediateExecution: boolean,
    }

    export enum QuoteForCase {
        QUOTE_FOR_NOT_SET = 0,
        AMOUNT_TO_SELL_IN_SATS = 1,
        AMOUNT_TO_BUY_IN_CENTS = 2,
    }

}

export class GetQuoteToBuyUsdResponse extends jspb.Message { 
    getQuoteId(): string;
    setQuoteId(value: string): GetQuoteToBuyUsdResponse;
    getAmountToSellInSats(): number;
    setAmountToSellInSats(value: number): GetQuoteToBuyUsdResponse;
    getAmountToBuyInCents(): number;
    setAmountToBuyInCents(value: number): GetQuoteToBuyUsdResponse;
    getExpiresAt(): number;
    setExpiresAt(value: number): GetQuoteToBuyUsdResponse;
    getExecuted(): boolean;
    setExecuted(value: boolean): GetQuoteToBuyUsdResponse;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): GetQuoteToBuyUsdResponse.AsObject;
    static toObject(includeInstance: boolean, msg: GetQuoteToBuyUsdResponse): GetQuoteToBuyUsdResponse.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: GetQuoteToBuyUsdResponse, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): GetQuoteToBuyUsdResponse;
    static deserializeBinaryFromReader(message: GetQuoteToBuyUsdResponse, reader: jspb.BinaryReader): GetQuoteToBuyUsdResponse;
}

export namespace GetQuoteToBuyUsdResponse {
    export type AsObject = {
        quoteId: string,
        amountToSellInSats: number,
        amountToBuyInCents: number,
        expiresAt: number,
        executed: boolean,
    }
}

export class GetQuoteToSellUsdRequest extends jspb.Message { 

    hasAmountToBuyInSats(): boolean;
    clearAmountToBuyInSats(): void;
    getAmountToBuyInSats(): number;
    setAmountToBuyInSats(value: number): GetQuoteToSellUsdRequest;

    hasAmountToSellInCents(): boolean;
    clearAmountToSellInCents(): void;
    getAmountToSellInCents(): number;
    setAmountToSellInCents(value: number): GetQuoteToSellUsdRequest;
    getImmediateExecution(): boolean;
    setImmediateExecution(value: boolean): GetQuoteToSellUsdRequest;

    getQuoteForCase(): GetQuoteToSellUsdRequest.QuoteForCase;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): GetQuoteToSellUsdRequest.AsObject;
    static toObject(includeInstance: boolean, msg: GetQuoteToSellUsdRequest): GetQuoteToSellUsdRequest.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: GetQuoteToSellUsdRequest, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): GetQuoteToSellUsdRequest;
    static deserializeBinaryFromReader(message: GetQuoteToSellUsdRequest, reader: jspb.BinaryReader): GetQuoteToSellUsdRequest;
}

export namespace GetQuoteToSellUsdRequest {
    export type AsObject = {
        amountToBuyInSats: number,
        amountToSellInCents: number,
        immediateExecution: boolean,
    }

    export enum QuoteForCase {
        QUOTE_FOR_NOT_SET = 0,
        AMOUNT_TO_BUY_IN_SATS = 1,
        AMOUNT_TO_SELL_IN_CENTS = 2,
    }

}

export class GetQuoteToSellUsdResponse extends jspb.Message { 
    getQuoteId(): string;
    setQuoteId(value: string): GetQuoteToSellUsdResponse;
    getAmountToBuyInSats(): number;
    setAmountToBuyInSats(value: number): GetQuoteToSellUsdResponse;
    getAmountToSellInCents(): number;
    setAmountToSellInCents(value: number): GetQuoteToSellUsdResponse;
    getExpiresAt(): number;
    setExpiresAt(value: number): GetQuoteToSellUsdResponse;
    getExecuted(): boolean;
    setExecuted(value: boolean): GetQuoteToSellUsdResponse;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): GetQuoteToSellUsdResponse.AsObject;
    static toObject(includeInstance: boolean, msg: GetQuoteToSellUsdResponse): GetQuoteToSellUsdResponse.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: GetQuoteToSellUsdResponse, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): GetQuoteToSellUsdResponse;
    static deserializeBinaryFromReader(message: GetQuoteToSellUsdResponse, reader: jspb.BinaryReader): GetQuoteToSellUsdResponse;
}

export namespace GetQuoteToSellUsdResponse {
    export type AsObject = {
        quoteId: string,
        amountToBuyInSats: number,
        amountToSellInCents: number,
        expiresAt: number,
        executed: boolean,
    }
}

export class AcceptQuoteRequest extends jspb.Message { 
    getQuoteId(): string;
    setQuoteId(value: string): AcceptQuoteRequest;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): AcceptQuoteRequest.AsObject;
    static toObject(includeInstance: boolean, msg: AcceptQuoteRequest): AcceptQuoteRequest.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: AcceptQuoteRequest, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): AcceptQuoteRequest;
    static deserializeBinaryFromReader(message: AcceptQuoteRequest, reader: jspb.BinaryReader): AcceptQuoteRequest;
}

export namespace AcceptQuoteRequest {
    export type AsObject = {
        quoteId: string,
    }
}

export class AcceptQuoteResponse extends jspb.Message { 

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): AcceptQuoteResponse.AsObject;
    static toObject(includeInstance: boolean, msg: AcceptQuoteResponse): AcceptQuoteResponse.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: AcceptQuoteResponse, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): AcceptQuoteResponse;
    static deserializeBinaryFromReader(message: AcceptQuoteResponse, reader: jspb.BinaryReader): AcceptQuoteResponse;
}

export namespace AcceptQuoteResponse {
    export type AsObject = {
    }
}
