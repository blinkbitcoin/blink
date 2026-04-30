// package: services.transactions.v1
// file: transactions.proto

/* tslint:disable */
/* eslint-disable */

import * as jspb from "google-protobuf";

export class SubscribeTransactionsRequest extends jspb.Message { 

    hasAfterTransactionId(): boolean;
    clearAfterTransactionId(): void;
    getAfterTransactionId(): string | undefined;
    setAfterTransactionId(value: string): SubscribeTransactionsRequest;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): SubscribeTransactionsRequest.AsObject;
    static toObject(includeInstance: boolean, msg: SubscribeTransactionsRequest): SubscribeTransactionsRequest.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: SubscribeTransactionsRequest, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): SubscribeTransactionsRequest;
    static deserializeBinaryFromReader(message: SubscribeTransactionsRequest, reader: jspb.BinaryReader): SubscribeTransactionsRequest;
}

export namespace SubscribeTransactionsRequest {
    export type AsObject = {
        afterTransactionId?: string,
    }
}

export class TransactionEvent extends jspb.Message { 
    getLedgerTransactionId(): string;
    setLedgerTransactionId(value: string): TransactionEvent;
    getWalletId(): string;
    setWalletId(value: string): TransactionEvent;
    getAccountId(): string;
    setAccountId(value: string): TransactionEvent;
    getPaymentHash(): string;
    setPaymentHash(value: string): TransactionEvent;
    getPreimage(): string;
    setPreimage(value: string): TransactionEvent;
    getSatsAmount(): number;
    setSatsAmount(value: number): TransactionEvent;
    getCentsAmount(): number;
    setCentsAmount(value: number): TransactionEvent;
    getCurrency(): string;
    setCurrency(value: string): TransactionEvent;
    getType(): TransactionType;
    setType(value: TransactionType): TransactionEvent;
    getSettlementVia(): SettlementViaType;
    setSettlementVia(value: SettlementViaType): TransactionEvent;
    getPending(): boolean;
    setPending(value: boolean): TransactionEvent;
    getTimestamp(): number;
    setTimestamp(value: number): TransactionEvent;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): TransactionEvent.AsObject;
    static toObject(includeInstance: boolean, msg: TransactionEvent): TransactionEvent.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: TransactionEvent, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): TransactionEvent;
    static deserializeBinaryFromReader(message: TransactionEvent, reader: jspb.BinaryReader): TransactionEvent;
}

export namespace TransactionEvent {
    export type AsObject = {
        ledgerTransactionId: string,
        walletId: string,
        accountId: string,
        paymentHash: string,
        preimage: string,
        satsAmount: number,
        centsAmount: number,
        currency: string,
        type: TransactionType,
        settlementVia: SettlementViaType,
        pending: boolean,
        timestamp: number,
    }
}

export enum TransactionType {
    TRANSACTION_TYPE_UNSPECIFIED = 0,
    SENT = 1,
    RECEIVED = 2,
}

export enum SettlementViaType {
    SETTLEMENT_VIA_UNSPECIFIED = 0,
    LIGHTNING = 1,
    INTRA_LEDGER = 2,
    ONCHAIN = 3,
}
