// package: services.notifications.v1
// file: notifications.proto

/* tslint:disable */
/* eslint-disable */

import * as jspb from "google-protobuf";

export class ShouldSendNotificationRequest extends jspb.Message { 
    getUserId(): string;
    setUserId(value: string): ShouldSendNotificationRequest;
    getChannel(): NotificationChannel;
    setChannel(value: NotificationChannel): ShouldSendNotificationRequest;
    getCategory(): NotificationCategory;
    setCategory(value: NotificationCategory): ShouldSendNotificationRequest;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): ShouldSendNotificationRequest.AsObject;
    static toObject(includeInstance: boolean, msg: ShouldSendNotificationRequest): ShouldSendNotificationRequest.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: ShouldSendNotificationRequest, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): ShouldSendNotificationRequest;
    static deserializeBinaryFromReader(message: ShouldSendNotificationRequest, reader: jspb.BinaryReader): ShouldSendNotificationRequest;
}

export namespace ShouldSendNotificationRequest {
    export type AsObject = {
        userId: string,
        channel: NotificationChannel,
        category: NotificationCategory,
    }
}

export class ShouldSendNotificationResponse extends jspb.Message { 
    getUserId(): string;
    setUserId(value: string): ShouldSendNotificationResponse;
    getShouldSend(): boolean;
    setShouldSend(value: boolean): ShouldSendNotificationResponse;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): ShouldSendNotificationResponse.AsObject;
    static toObject(includeInstance: boolean, msg: ShouldSendNotificationResponse): ShouldSendNotificationResponse.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: ShouldSendNotificationResponse, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): ShouldSendNotificationResponse;
    static deserializeBinaryFromReader(message: ShouldSendNotificationResponse, reader: jspb.BinaryReader): ShouldSendNotificationResponse;
}

export namespace ShouldSendNotificationResponse {
    export type AsObject = {
        userId: string,
        shouldSend: boolean,
    }
}

export class EnableNotificationChannelRequest extends jspb.Message { 
    getUserId(): string;
    setUserId(value: string): EnableNotificationChannelRequest;
    getChannel(): NotificationChannel;
    setChannel(value: NotificationChannel): EnableNotificationChannelRequest;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): EnableNotificationChannelRequest.AsObject;
    static toObject(includeInstance: boolean, msg: EnableNotificationChannelRequest): EnableNotificationChannelRequest.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: EnableNotificationChannelRequest, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): EnableNotificationChannelRequest;
    static deserializeBinaryFromReader(message: EnableNotificationChannelRequest, reader: jspb.BinaryReader): EnableNotificationChannelRequest;
}

export namespace EnableNotificationChannelRequest {
    export type AsObject = {
        userId: string,
        channel: NotificationChannel,
    }
}

export class EnableNotificationChannelResponse extends jspb.Message { 

    hasNotificationSettings(): boolean;
    clearNotificationSettings(): void;
    getNotificationSettings(): NotificationSettings | undefined;
    setNotificationSettings(value?: NotificationSettings): EnableNotificationChannelResponse;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): EnableNotificationChannelResponse.AsObject;
    static toObject(includeInstance: boolean, msg: EnableNotificationChannelResponse): EnableNotificationChannelResponse.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: EnableNotificationChannelResponse, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): EnableNotificationChannelResponse;
    static deserializeBinaryFromReader(message: EnableNotificationChannelResponse, reader: jspb.BinaryReader): EnableNotificationChannelResponse;
}

export namespace EnableNotificationChannelResponse {
    export type AsObject = {
        notificationSettings?: NotificationSettings.AsObject,
    }
}

export class NotificationSettings extends jspb.Message { 

    hasPush(): boolean;
    clearPush(): void;
    getPush(): ChannelNotificationSettings | undefined;
    setPush(value?: ChannelNotificationSettings): NotificationSettings;

    hasLocale(): boolean;
    clearLocale(): void;
    getLocale(): string | undefined;
    setLocale(value: string): NotificationSettings;
    clearPushDeviceTokensList(): void;
    getPushDeviceTokensList(): Array<string>;
    setPushDeviceTokensList(value: Array<string>): NotificationSettings;
    addPushDeviceTokens(value: string, index?: number): string;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): NotificationSettings.AsObject;
    static toObject(includeInstance: boolean, msg: NotificationSettings): NotificationSettings.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: NotificationSettings, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): NotificationSettings;
    static deserializeBinaryFromReader(message: NotificationSettings, reader: jspb.BinaryReader): NotificationSettings;
}

export namespace NotificationSettings {
    export type AsObject = {
        push?: ChannelNotificationSettings.AsObject,
        locale?: string,
        pushDeviceTokensList: Array<string>,
    }
}

export class ChannelNotificationSettings extends jspb.Message { 
    getEnabled(): boolean;
    setEnabled(value: boolean): ChannelNotificationSettings;
    clearDisabledCategoriesList(): void;
    getDisabledCategoriesList(): Array<NotificationCategory>;
    setDisabledCategoriesList(value: Array<NotificationCategory>): ChannelNotificationSettings;
    addDisabledCategories(value: NotificationCategory, index?: number): NotificationCategory;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): ChannelNotificationSettings.AsObject;
    static toObject(includeInstance: boolean, msg: ChannelNotificationSettings): ChannelNotificationSettings.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: ChannelNotificationSettings, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): ChannelNotificationSettings;
    static deserializeBinaryFromReader(message: ChannelNotificationSettings, reader: jspb.BinaryReader): ChannelNotificationSettings;
}

export namespace ChannelNotificationSettings {
    export type AsObject = {
        enabled: boolean,
        disabledCategoriesList: Array<NotificationCategory>,
    }
}

export class DisableNotificationChannelRequest extends jspb.Message { 
    getUserId(): string;
    setUserId(value: string): DisableNotificationChannelRequest;
    getChannel(): NotificationChannel;
    setChannel(value: NotificationChannel): DisableNotificationChannelRequest;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): DisableNotificationChannelRequest.AsObject;
    static toObject(includeInstance: boolean, msg: DisableNotificationChannelRequest): DisableNotificationChannelRequest.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: DisableNotificationChannelRequest, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): DisableNotificationChannelRequest;
    static deserializeBinaryFromReader(message: DisableNotificationChannelRequest, reader: jspb.BinaryReader): DisableNotificationChannelRequest;
}

export namespace DisableNotificationChannelRequest {
    export type AsObject = {
        userId: string,
        channel: NotificationChannel,
    }
}

export class DisableNotificationChannelResponse extends jspb.Message { 

    hasNotificationSettings(): boolean;
    clearNotificationSettings(): void;
    getNotificationSettings(): NotificationSettings | undefined;
    setNotificationSettings(value?: NotificationSettings): DisableNotificationChannelResponse;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): DisableNotificationChannelResponse.AsObject;
    static toObject(includeInstance: boolean, msg: DisableNotificationChannelResponse): DisableNotificationChannelResponse.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: DisableNotificationChannelResponse, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): DisableNotificationChannelResponse;
    static deserializeBinaryFromReader(message: DisableNotificationChannelResponse, reader: jspb.BinaryReader): DisableNotificationChannelResponse;
}

export namespace DisableNotificationChannelResponse {
    export type AsObject = {
        notificationSettings?: NotificationSettings.AsObject,
    }
}

export class DisableNotificationCategoryRequest extends jspb.Message { 
    getUserId(): string;
    setUserId(value: string): DisableNotificationCategoryRequest;
    getChannel(): NotificationChannel;
    setChannel(value: NotificationChannel): DisableNotificationCategoryRequest;
    getCategory(): NotificationCategory;
    setCategory(value: NotificationCategory): DisableNotificationCategoryRequest;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): DisableNotificationCategoryRequest.AsObject;
    static toObject(includeInstance: boolean, msg: DisableNotificationCategoryRequest): DisableNotificationCategoryRequest.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: DisableNotificationCategoryRequest, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): DisableNotificationCategoryRequest;
    static deserializeBinaryFromReader(message: DisableNotificationCategoryRequest, reader: jspb.BinaryReader): DisableNotificationCategoryRequest;
}

export namespace DisableNotificationCategoryRequest {
    export type AsObject = {
        userId: string,
        channel: NotificationChannel,
        category: NotificationCategory,
    }
}

export class DisableNotificationCategoryResponse extends jspb.Message { 

    hasNotificationSettings(): boolean;
    clearNotificationSettings(): void;
    getNotificationSettings(): NotificationSettings | undefined;
    setNotificationSettings(value?: NotificationSettings): DisableNotificationCategoryResponse;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): DisableNotificationCategoryResponse.AsObject;
    static toObject(includeInstance: boolean, msg: DisableNotificationCategoryResponse): DisableNotificationCategoryResponse.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: DisableNotificationCategoryResponse, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): DisableNotificationCategoryResponse;
    static deserializeBinaryFromReader(message: DisableNotificationCategoryResponse, reader: jspb.BinaryReader): DisableNotificationCategoryResponse;
}

export namespace DisableNotificationCategoryResponse {
    export type AsObject = {
        notificationSettings?: NotificationSettings.AsObject,
    }
}

export class EnableNotificationCategoryRequest extends jspb.Message { 
    getUserId(): string;
    setUserId(value: string): EnableNotificationCategoryRequest;
    getChannel(): NotificationChannel;
    setChannel(value: NotificationChannel): EnableNotificationCategoryRequest;
    getCategory(): NotificationCategory;
    setCategory(value: NotificationCategory): EnableNotificationCategoryRequest;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): EnableNotificationCategoryRequest.AsObject;
    static toObject(includeInstance: boolean, msg: EnableNotificationCategoryRequest): EnableNotificationCategoryRequest.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: EnableNotificationCategoryRequest, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): EnableNotificationCategoryRequest;
    static deserializeBinaryFromReader(message: EnableNotificationCategoryRequest, reader: jspb.BinaryReader): EnableNotificationCategoryRequest;
}

export namespace EnableNotificationCategoryRequest {
    export type AsObject = {
        userId: string,
        channel: NotificationChannel,
        category: NotificationCategory,
    }
}

export class EnableNotificationCategoryResponse extends jspb.Message { 

    hasNotificationSettings(): boolean;
    clearNotificationSettings(): void;
    getNotificationSettings(): NotificationSettings | undefined;
    setNotificationSettings(value?: NotificationSettings): EnableNotificationCategoryResponse;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): EnableNotificationCategoryResponse.AsObject;
    static toObject(includeInstance: boolean, msg: EnableNotificationCategoryResponse): EnableNotificationCategoryResponse.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: EnableNotificationCategoryResponse, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): EnableNotificationCategoryResponse;
    static deserializeBinaryFromReader(message: EnableNotificationCategoryResponse, reader: jspb.BinaryReader): EnableNotificationCategoryResponse;
}

export namespace EnableNotificationCategoryResponse {
    export type AsObject = {
        notificationSettings?: NotificationSettings.AsObject,
    }
}

export class GetNotificationSettingsRequest extends jspb.Message { 
    getUserId(): string;
    setUserId(value: string): GetNotificationSettingsRequest;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): GetNotificationSettingsRequest.AsObject;
    static toObject(includeInstance: boolean, msg: GetNotificationSettingsRequest): GetNotificationSettingsRequest.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: GetNotificationSettingsRequest, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): GetNotificationSettingsRequest;
    static deserializeBinaryFromReader(message: GetNotificationSettingsRequest, reader: jspb.BinaryReader): GetNotificationSettingsRequest;
}

export namespace GetNotificationSettingsRequest {
    export type AsObject = {
        userId: string,
    }
}

export class GetNotificationSettingsResponse extends jspb.Message { 

    hasNotificationSettings(): boolean;
    clearNotificationSettings(): void;
    getNotificationSettings(): NotificationSettings | undefined;
    setNotificationSettings(value?: NotificationSettings): GetNotificationSettingsResponse;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): GetNotificationSettingsResponse.AsObject;
    static toObject(includeInstance: boolean, msg: GetNotificationSettingsResponse): GetNotificationSettingsResponse.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: GetNotificationSettingsResponse, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): GetNotificationSettingsResponse;
    static deserializeBinaryFromReader(message: GetNotificationSettingsResponse, reader: jspb.BinaryReader): GetNotificationSettingsResponse;
}

export namespace GetNotificationSettingsResponse {
    export type AsObject = {
        notificationSettings?: NotificationSettings.AsObject,
    }
}

export class UpdateUserLocaleRequest extends jspb.Message { 
    getUserId(): string;
    setUserId(value: string): UpdateUserLocaleRequest;
    getLocale(): string;
    setLocale(value: string): UpdateUserLocaleRequest;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): UpdateUserLocaleRequest.AsObject;
    static toObject(includeInstance: boolean, msg: UpdateUserLocaleRequest): UpdateUserLocaleRequest.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: UpdateUserLocaleRequest, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): UpdateUserLocaleRequest;
    static deserializeBinaryFromReader(message: UpdateUserLocaleRequest, reader: jspb.BinaryReader): UpdateUserLocaleRequest;
}

export namespace UpdateUserLocaleRequest {
    export type AsObject = {
        userId: string,
        locale: string,
    }
}

export class UpdateUserLocaleResponse extends jspb.Message { 

    hasNotificationSettings(): boolean;
    clearNotificationSettings(): void;
    getNotificationSettings(): NotificationSettings | undefined;
    setNotificationSettings(value?: NotificationSettings): UpdateUserLocaleResponse;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): UpdateUserLocaleResponse.AsObject;
    static toObject(includeInstance: boolean, msg: UpdateUserLocaleResponse): UpdateUserLocaleResponse.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: UpdateUserLocaleResponse, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): UpdateUserLocaleResponse;
    static deserializeBinaryFromReader(message: UpdateUserLocaleResponse, reader: jspb.BinaryReader): UpdateUserLocaleResponse;
}

export namespace UpdateUserLocaleResponse {
    export type AsObject = {
        notificationSettings?: NotificationSettings.AsObject,
    }
}

export class AddPushDeviceTokenRequest extends jspb.Message { 
    getUserId(): string;
    setUserId(value: string): AddPushDeviceTokenRequest;
    getDeviceToken(): string;
    setDeviceToken(value: string): AddPushDeviceTokenRequest;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): AddPushDeviceTokenRequest.AsObject;
    static toObject(includeInstance: boolean, msg: AddPushDeviceTokenRequest): AddPushDeviceTokenRequest.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: AddPushDeviceTokenRequest, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): AddPushDeviceTokenRequest;
    static deserializeBinaryFromReader(message: AddPushDeviceTokenRequest, reader: jspb.BinaryReader): AddPushDeviceTokenRequest;
}

export namespace AddPushDeviceTokenRequest {
    export type AsObject = {
        userId: string,
        deviceToken: string,
    }
}

export class AddPushDeviceTokenResponse extends jspb.Message { 

    hasNotificationSettings(): boolean;
    clearNotificationSettings(): void;
    getNotificationSettings(): NotificationSettings | undefined;
    setNotificationSettings(value?: NotificationSettings): AddPushDeviceTokenResponse;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): AddPushDeviceTokenResponse.AsObject;
    static toObject(includeInstance: boolean, msg: AddPushDeviceTokenResponse): AddPushDeviceTokenResponse.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: AddPushDeviceTokenResponse, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): AddPushDeviceTokenResponse;
    static deserializeBinaryFromReader(message: AddPushDeviceTokenResponse, reader: jspb.BinaryReader): AddPushDeviceTokenResponse;
}

export namespace AddPushDeviceTokenResponse {
    export type AsObject = {
        notificationSettings?: NotificationSettings.AsObject,
    }
}

export class RemovePushDeviceTokenRequest extends jspb.Message { 
    getUserId(): string;
    setUserId(value: string): RemovePushDeviceTokenRequest;
    getDeviceToken(): string;
    setDeviceToken(value: string): RemovePushDeviceTokenRequest;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): RemovePushDeviceTokenRequest.AsObject;
    static toObject(includeInstance: boolean, msg: RemovePushDeviceTokenRequest): RemovePushDeviceTokenRequest.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: RemovePushDeviceTokenRequest, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): RemovePushDeviceTokenRequest;
    static deserializeBinaryFromReader(message: RemovePushDeviceTokenRequest, reader: jspb.BinaryReader): RemovePushDeviceTokenRequest;
}

export namespace RemovePushDeviceTokenRequest {
    export type AsObject = {
        userId: string,
        deviceToken: string,
    }
}

export class RemovePushDeviceTokenResponse extends jspb.Message { 

    hasNotificationSettings(): boolean;
    clearNotificationSettings(): void;
    getNotificationSettings(): NotificationSettings | undefined;
    setNotificationSettings(value?: NotificationSettings): RemovePushDeviceTokenResponse;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): RemovePushDeviceTokenResponse.AsObject;
    static toObject(includeInstance: boolean, msg: RemovePushDeviceTokenResponse): RemovePushDeviceTokenResponse.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: RemovePushDeviceTokenResponse, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): RemovePushDeviceTokenResponse;
    static deserializeBinaryFromReader(message: RemovePushDeviceTokenResponse, reader: jspb.BinaryReader): RemovePushDeviceTokenResponse;
}

export namespace RemovePushDeviceTokenResponse {
    export type AsObject = {
        notificationSettings?: NotificationSettings.AsObject,
    }
}

export class UpdateEmailAddressRequest extends jspb.Message { 
    getUserId(): string;
    setUserId(value: string): UpdateEmailAddressRequest;
    getEmailAddress(): string;
    setEmailAddress(value: string): UpdateEmailAddressRequest;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): UpdateEmailAddressRequest.AsObject;
    static toObject(includeInstance: boolean, msg: UpdateEmailAddressRequest): UpdateEmailAddressRequest.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: UpdateEmailAddressRequest, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): UpdateEmailAddressRequest;
    static deserializeBinaryFromReader(message: UpdateEmailAddressRequest, reader: jspb.BinaryReader): UpdateEmailAddressRequest;
}

export namespace UpdateEmailAddressRequest {
    export type AsObject = {
        userId: string,
        emailAddress: string,
    }
}

export class UpdateEmailAddressResponse extends jspb.Message { 

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): UpdateEmailAddressResponse.AsObject;
    static toObject(includeInstance: boolean, msg: UpdateEmailAddressResponse): UpdateEmailAddressResponse.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: UpdateEmailAddressResponse, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): UpdateEmailAddressResponse;
    static deserializeBinaryFromReader(message: UpdateEmailAddressResponse, reader: jspb.BinaryReader): UpdateEmailAddressResponse;
}

export namespace UpdateEmailAddressResponse {
    export type AsObject = {
    }
}

export class RemoveEmailAddressRequest extends jspb.Message { 
    getUserId(): string;
    setUserId(value: string): RemoveEmailAddressRequest;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): RemoveEmailAddressRequest.AsObject;
    static toObject(includeInstance: boolean, msg: RemoveEmailAddressRequest): RemoveEmailAddressRequest.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: RemoveEmailAddressRequest, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): RemoveEmailAddressRequest;
    static deserializeBinaryFromReader(message: RemoveEmailAddressRequest, reader: jspb.BinaryReader): RemoveEmailAddressRequest;
}

export namespace RemoveEmailAddressRequest {
    export type AsObject = {
        userId: string,
    }
}

export class RemoveEmailAddressResponse extends jspb.Message { 

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): RemoveEmailAddressResponse.AsObject;
    static toObject(includeInstance: boolean, msg: RemoveEmailAddressResponse): RemoveEmailAddressResponse.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: RemoveEmailAddressResponse, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): RemoveEmailAddressResponse;
    static deserializeBinaryFromReader(message: RemoveEmailAddressResponse, reader: jspb.BinaryReader): RemoveEmailAddressResponse;
}

export namespace RemoveEmailAddressResponse {
    export type AsObject = {
    }
}

export class HandleNotificationEventRequest extends jspb.Message { 

    hasEvent(): boolean;
    clearEvent(): void;
    getEvent(): NotificationEvent | undefined;
    setEvent(value?: NotificationEvent): HandleNotificationEventRequest;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): HandleNotificationEventRequest.AsObject;
    static toObject(includeInstance: boolean, msg: HandleNotificationEventRequest): HandleNotificationEventRequest.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: HandleNotificationEventRequest, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): HandleNotificationEventRequest;
    static deserializeBinaryFromReader(message: HandleNotificationEventRequest, reader: jspb.BinaryReader): HandleNotificationEventRequest;
}

export namespace HandleNotificationEventRequest {
    export type AsObject = {
        event?: NotificationEvent.AsObject,
    }
}

export class HandleNotificationEventResponse extends jspb.Message { 

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): HandleNotificationEventResponse.AsObject;
    static toObject(includeInstance: boolean, msg: HandleNotificationEventResponse): HandleNotificationEventResponse.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: HandleNotificationEventResponse, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): HandleNotificationEventResponse;
    static deserializeBinaryFromReader(message: HandleNotificationEventResponse, reader: jspb.BinaryReader): HandleNotificationEventResponse;
}

export namespace HandleNotificationEventResponse {
    export type AsObject = {
    }
}

export class NotificationEvent extends jspb.Message { 

    hasCircleGrew(): boolean;
    clearCircleGrew(): void;
    getCircleGrew(): CircleGrew | undefined;
    setCircleGrew(value?: CircleGrew): NotificationEvent;

    hasCircleThresholdReached(): boolean;
    clearCircleThresholdReached(): void;
    getCircleThresholdReached(): CircleThresholdReached | undefined;
    setCircleThresholdReached(value?: CircleThresholdReached): NotificationEvent;

    hasIdentityVerificationApproved(): boolean;
    clearIdentityVerificationApproved(): void;
    getIdentityVerificationApproved(): IdentityVerificationApproved | undefined;
    setIdentityVerificationApproved(value?: IdentityVerificationApproved): NotificationEvent;

    hasIdentityVerificationDeclined(): boolean;
    clearIdentityVerificationDeclined(): void;
    getIdentityVerificationDeclined(): IdentityVerificationDeclined | undefined;
    setIdentityVerificationDeclined(value?: IdentityVerificationDeclined): NotificationEvent;

    hasIdentityVerificationReviewStarted(): boolean;
    clearIdentityVerificationReviewStarted(): void;
    getIdentityVerificationReviewStarted(): IdentityVerificationReviewStarted | undefined;
    setIdentityVerificationReviewStarted(value?: IdentityVerificationReviewStarted): NotificationEvent;

    hasTransactionOccurred(): boolean;
    clearTransactionOccurred(): void;
    getTransactionOccurred(): TransactionOccurred | undefined;
    setTransactionOccurred(value?: TransactionOccurred): NotificationEvent;

    hasPrice(): boolean;
    clearPrice(): void;
    getPrice(): PriceChanged | undefined;
    setPrice(value?: PriceChanged): NotificationEvent;

    hasMarketingNotificationTriggered(): boolean;
    clearMarketingNotificationTriggered(): void;
    getMarketingNotificationTriggered(): MarketingNotificationTriggered | undefined;
    setMarketingNotificationTriggered(value?: MarketingNotificationTriggered): NotificationEvent;

    getDataCase(): NotificationEvent.DataCase;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): NotificationEvent.AsObject;
    static toObject(includeInstance: boolean, msg: NotificationEvent): NotificationEvent.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: NotificationEvent, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): NotificationEvent;
    static deserializeBinaryFromReader(message: NotificationEvent, reader: jspb.BinaryReader): NotificationEvent;
}

export namespace NotificationEvent {
    export type AsObject = {
        circleGrew?: CircleGrew.AsObject,
        circleThresholdReached?: CircleThresholdReached.AsObject,
        identityVerificationApproved?: IdentityVerificationApproved.AsObject,
        identityVerificationDeclined?: IdentityVerificationDeclined.AsObject,
        identityVerificationReviewStarted?: IdentityVerificationReviewStarted.AsObject,
        transactionOccurred?: TransactionOccurred.AsObject,
        price?: PriceChanged.AsObject,
        marketingNotificationTriggered?: MarketingNotificationTriggered.AsObject,
    }

    export enum DataCase {
        DATA_NOT_SET = 0,
        CIRCLE_GREW = 1,
        CIRCLE_THRESHOLD_REACHED = 2,
        IDENTITY_VERIFICATION_APPROVED = 3,
        IDENTITY_VERIFICATION_DECLINED = 4,
        IDENTITY_VERIFICATION_REVIEW_STARTED = 5,
        TRANSACTION_OCCURRED = 6,
        PRICE = 7,
        MARKETING_NOTIFICATION_TRIGGERED = 8,
    }

}

export class CircleGrew extends jspb.Message { 
    getUserId(): string;
    setUserId(value: string): CircleGrew;
    getCircleType(): CircleType;
    setCircleType(value: CircleType): CircleGrew;
    getThisMonthCircleSize(): number;
    setThisMonthCircleSize(value: number): CircleGrew;
    getAllTimeCircleSize(): number;
    setAllTimeCircleSize(value: number): CircleGrew;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): CircleGrew.AsObject;
    static toObject(includeInstance: boolean, msg: CircleGrew): CircleGrew.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: CircleGrew, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): CircleGrew;
    static deserializeBinaryFromReader(message: CircleGrew, reader: jspb.BinaryReader): CircleGrew;
}

export namespace CircleGrew {
    export type AsObject = {
        userId: string,
        circleType: CircleType,
        thisMonthCircleSize: number,
        allTimeCircleSize: number,
    }
}

export class CircleThresholdReached extends jspb.Message { 
    getUserId(): string;
    setUserId(value: string): CircleThresholdReached;
    getCircleType(): CircleType;
    setCircleType(value: CircleType): CircleThresholdReached;
    getTimeFrame(): CircleTimeFrame;
    setTimeFrame(value: CircleTimeFrame): CircleThresholdReached;
    getThreshold(): number;
    setThreshold(value: number): CircleThresholdReached;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): CircleThresholdReached.AsObject;
    static toObject(includeInstance: boolean, msg: CircleThresholdReached): CircleThresholdReached.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: CircleThresholdReached, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): CircleThresholdReached;
    static deserializeBinaryFromReader(message: CircleThresholdReached, reader: jspb.BinaryReader): CircleThresholdReached;
}

export namespace CircleThresholdReached {
    export type AsObject = {
        userId: string,
        circleType: CircleType,
        timeFrame: CircleTimeFrame,
        threshold: number,
    }
}

export class IdentityVerificationApproved extends jspb.Message { 
    getUserId(): string;
    setUserId(value: string): IdentityVerificationApproved;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): IdentityVerificationApproved.AsObject;
    static toObject(includeInstance: boolean, msg: IdentityVerificationApproved): IdentityVerificationApproved.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: IdentityVerificationApproved, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): IdentityVerificationApproved;
    static deserializeBinaryFromReader(message: IdentityVerificationApproved, reader: jspb.BinaryReader): IdentityVerificationApproved;
}

export namespace IdentityVerificationApproved {
    export type AsObject = {
        userId: string,
    }
}

export class IdentityVerificationDeclined extends jspb.Message { 
    getUserId(): string;
    setUserId(value: string): IdentityVerificationDeclined;
    getDeclinedReason(): DeclinedReason;
    setDeclinedReason(value: DeclinedReason): IdentityVerificationDeclined;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): IdentityVerificationDeclined.AsObject;
    static toObject(includeInstance: boolean, msg: IdentityVerificationDeclined): IdentityVerificationDeclined.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: IdentityVerificationDeclined, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): IdentityVerificationDeclined;
    static deserializeBinaryFromReader(message: IdentityVerificationDeclined, reader: jspb.BinaryReader): IdentityVerificationDeclined;
}

export namespace IdentityVerificationDeclined {
    export type AsObject = {
        userId: string,
        declinedReason: DeclinedReason,
    }
}

export class IdentityVerificationReviewStarted extends jspb.Message { 
    getUserId(): string;
    setUserId(value: string): IdentityVerificationReviewStarted;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): IdentityVerificationReviewStarted.AsObject;
    static toObject(includeInstance: boolean, msg: IdentityVerificationReviewStarted): IdentityVerificationReviewStarted.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: IdentityVerificationReviewStarted, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): IdentityVerificationReviewStarted;
    static deserializeBinaryFromReader(message: IdentityVerificationReviewStarted, reader: jspb.BinaryReader): IdentityVerificationReviewStarted;
}

export namespace IdentityVerificationReviewStarted {
    export type AsObject = {
        userId: string,
    }
}

export class TransactionOccurred extends jspb.Message { 
    getUserId(): string;
    setUserId(value: string): TransactionOccurred;
    getType(): TransactionType;
    setType(value: TransactionType): TransactionOccurred;

    hasSettlementAmount(): boolean;
    clearSettlementAmount(): void;
    getSettlementAmount(): Money | undefined;
    setSettlementAmount(value?: Money): TransactionOccurred;

    hasDisplayAmount(): boolean;
    clearDisplayAmount(): void;
    getDisplayAmount(): Money | undefined;
    setDisplayAmount(value?: Money): TransactionOccurred;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): TransactionOccurred.AsObject;
    static toObject(includeInstance: boolean, msg: TransactionOccurred): TransactionOccurred.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: TransactionOccurred, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): TransactionOccurred;
    static deserializeBinaryFromReader(message: TransactionOccurred, reader: jspb.BinaryReader): TransactionOccurred;
}

export namespace TransactionOccurred {
    export type AsObject = {
        userId: string,
        type: TransactionType,
        settlementAmount?: Money.AsObject,
        displayAmount?: Money.AsObject,
    }
}

export class Money extends jspb.Message { 
    getCurrencyCode(): string;
    setCurrencyCode(value: string): Money;
    getMinorUnits(): number;
    setMinorUnits(value: number): Money;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): Money.AsObject;
    static toObject(includeInstance: boolean, msg: Money): Money.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: Money, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): Money;
    static deserializeBinaryFromReader(message: Money, reader: jspb.BinaryReader): Money;
}

export namespace Money {
    export type AsObject = {
        currencyCode: string,
        minorUnits: number,
    }
}

export class PriceChanged extends jspb.Message { 

    hasPriceOfOneBitcoin(): boolean;
    clearPriceOfOneBitcoin(): void;
    getPriceOfOneBitcoin(): Money | undefined;
    setPriceOfOneBitcoin(value?: Money): PriceChanged;
    getDirection(): PriceChangeDirection;
    setDirection(value: PriceChangeDirection): PriceChanged;
    getPriceChangePercentage(): number;
    setPriceChangePercentage(value: number): PriceChanged;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): PriceChanged.AsObject;
    static toObject(includeInstance: boolean, msg: PriceChanged): PriceChanged.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: PriceChanged, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): PriceChanged;
    static deserializeBinaryFromReader(message: PriceChanged, reader: jspb.BinaryReader): PriceChanged;
}

export namespace PriceChanged {
    export type AsObject = {
        priceOfOneBitcoin?: Money.AsObject,
        direction: PriceChangeDirection,
        priceChangePercentage: number,
    }
}

export class MarketingNotificationTriggered extends jspb.Message { 
    clearUserIdsList(): void;
    getUserIdsList(): Array<string>;
    setUserIdsList(value: Array<string>): MarketingNotificationTriggered;
    addUserIds(value: string, index?: number): string;

    getLocalizedContentMap(): jspb.Map<string, LocalizedContent>;
    clearLocalizedContentMap(): void;
    getShouldSendPush(): boolean;
    setShouldSendPush(value: boolean): MarketingNotificationTriggered;
    getShouldAddToHistory(): boolean;
    setShouldAddToHistory(value: boolean): MarketingNotificationTriggered;
    getShouldAddToBulletin(): boolean;
    setShouldAddToBulletin(value: boolean): MarketingNotificationTriggered;

    hasAction(): boolean;
    clearAction(): void;
    getAction(): Action | undefined;
    setAction(value?: Action): MarketingNotificationTriggered;

    hasIcon(): boolean;
    clearIcon(): void;
    getIcon(): Icon | undefined;
    setIcon(value: Icon): MarketingNotificationTriggered;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): MarketingNotificationTriggered.AsObject;
    static toObject(includeInstance: boolean, msg: MarketingNotificationTriggered): MarketingNotificationTriggered.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: MarketingNotificationTriggered, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): MarketingNotificationTriggered;
    static deserializeBinaryFromReader(message: MarketingNotificationTriggered, reader: jspb.BinaryReader): MarketingNotificationTriggered;
}

export namespace MarketingNotificationTriggered {
    export type AsObject = {
        userIdsList: Array<string>,

        localizedContentMap: Array<[string, LocalizedContent.AsObject]>,
        shouldSendPush: boolean,
        shouldAddToHistory: boolean,
        shouldAddToBulletin: boolean,
        action?: Action.AsObject,
        icon?: Icon,
    }
}

export class LocalizedContent extends jspb.Message { 
    getTitle(): string;
    setTitle(value: string): LocalizedContent;
    getBody(): string;
    setBody(value: string): LocalizedContent;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): LocalizedContent.AsObject;
    static toObject(includeInstance: boolean, msg: LocalizedContent): LocalizedContent.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: LocalizedContent, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): LocalizedContent;
    static deserializeBinaryFromReader(message: LocalizedContent, reader: jspb.BinaryReader): LocalizedContent;
}

export namespace LocalizedContent {
    export type AsObject = {
        title: string,
        body: string,
    }
}

export class Action extends jspb.Message { 

    hasDeepLink(): boolean;
    clearDeepLink(): void;
    getDeepLink(): DeepLink | undefined;
    setDeepLink(value?: DeepLink): Action;

    hasExternalUrl(): boolean;
    clearExternalUrl(): void;
    getExternalUrl(): string;
    setExternalUrl(value: string): Action;

    getDataCase(): Action.DataCase;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): Action.AsObject;
    static toObject(includeInstance: boolean, msg: Action): Action.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: Action, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): Action;
    static deserializeBinaryFromReader(message: Action, reader: jspb.BinaryReader): Action;
}

export namespace Action {
    export type AsObject = {
        deepLink?: DeepLink.AsObject,
        externalUrl: string,
    }

    export enum DataCase {
        DATA_NOT_SET = 0,
        DEEP_LINK = 1,
        EXTERNAL_URL = 2,
    }

}

export class DeepLink extends jspb.Message { 

    hasScreen(): boolean;
    clearScreen(): void;
    getScreen(): DeepLinkScreen | undefined;
    setScreen(value: DeepLinkScreen): DeepLink;

    hasAction(): boolean;
    clearAction(): void;
    getAction(): DeepLinkAction | undefined;
    setAction(value: DeepLinkAction): DeepLink;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): DeepLink.AsObject;
    static toObject(includeInstance: boolean, msg: DeepLink): DeepLink.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: DeepLink, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): DeepLink;
    static deserializeBinaryFromReader(message: DeepLink, reader: jspb.BinaryReader): DeepLink;
}

export namespace DeepLink {
    export type AsObject = {
        screen?: DeepLinkScreen,
        action?: DeepLinkAction,
    }
}

export class MsgTemplate extends jspb.Message { 
    getId(): string;
    setId(value: string): MsgTemplate;
    getName(): string;
    setName(value: string): MsgTemplate;
    getLanguageCode(): string;
    setLanguageCode(value: string): MsgTemplate;
    getIconName(): string;
    setIconName(value: string): MsgTemplate;
    getTitle(): string;
    setTitle(value: string): MsgTemplate;
    getBody(): string;
    setBody(value: string): MsgTemplate;
    getShouldSendPush(): boolean;
    setShouldSendPush(value: boolean): MsgTemplate;
    getShouldAddToHistory(): boolean;
    setShouldAddToHistory(value: boolean): MsgTemplate;
    getShouldAddToBulletin(): boolean;
    setShouldAddToBulletin(value: boolean): MsgTemplate;

    hasDeeplinkAction(): boolean;
    clearDeeplinkAction(): void;
    getDeeplinkAction(): string | undefined;
    setDeeplinkAction(value: string): MsgTemplate;

    hasDeeplinkScreen(): boolean;
    clearDeeplinkScreen(): void;
    getDeeplinkScreen(): string | undefined;
    setDeeplinkScreen(value: string): MsgTemplate;

    hasExternalUrl(): boolean;
    clearExternalUrl(): void;
    getExternalUrl(): string | undefined;
    setExternalUrl(value: string): MsgTemplate;

    hasStatus(): boolean;
    clearStatus(): void;
    getStatus(): string | undefined;
    setStatus(value: string): MsgTemplate;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): MsgTemplate.AsObject;
    static toObject(includeInstance: boolean, msg: MsgTemplate): MsgTemplate.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: MsgTemplate, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): MsgTemplate;
    static deserializeBinaryFromReader(message: MsgTemplate, reader: jspb.BinaryReader): MsgTemplate;
}

export namespace MsgTemplate {
    export type AsObject = {
        id: string,
        name: string,
        languageCode: string,
        iconName: string,
        title: string,
        body: string,
        shouldSendPush: boolean,
        shouldAddToHistory: boolean,
        shouldAddToBulletin: boolean,
        deeplinkAction?: string,
        deeplinkScreen?: string,
        externalUrl?: string,
        status?: string,
    }
}

export class MsgMessage extends jspb.Message { 
    getId(): string;
    setId(value: string): MsgMessage;
    getUsername(): string;
    setUsername(value: string): MsgMessage;
    getStatus(): string;
    setStatus(value: string): MsgMessage;
    getSentBy(): string;
    setSentBy(value: string): MsgMessage;

    hasTemplateId(): boolean;
    clearTemplateId(): void;
    getTemplateId(): string | undefined;
    setTemplateId(value: string): MsgMessage;
    getUpdatedAt(): number;
    setUpdatedAt(value: number): MsgMessage;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): MsgMessage.AsObject;
    static toObject(includeInstance: boolean, msg: MsgMessage): MsgMessage.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: MsgMessage, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): MsgMessage;
    static deserializeBinaryFromReader(message: MsgMessage, reader: jspb.BinaryReader): MsgMessage;
}

export namespace MsgMessage {
    export type AsObject = {
        id: string,
        username: string,
        status: string,
        sentBy: string,
        templateId?: string,
        updatedAt: number,
    }
}

export class MsgTemplateCreateRequest extends jspb.Message { 
    getName(): string;
    setName(value: string): MsgTemplateCreateRequest;
    getLanguageCode(): string;
    setLanguageCode(value: string): MsgTemplateCreateRequest;
    getIconName(): string;
    setIconName(value: string): MsgTemplateCreateRequest;
    getTitle(): string;
    setTitle(value: string): MsgTemplateCreateRequest;
    getBody(): string;
    setBody(value: string): MsgTemplateCreateRequest;
    getShouldSendPush(): boolean;
    setShouldSendPush(value: boolean): MsgTemplateCreateRequest;
    getShouldAddToHistory(): boolean;
    setShouldAddToHistory(value: boolean): MsgTemplateCreateRequest;
    getShouldAddToBulletin(): boolean;
    setShouldAddToBulletin(value: boolean): MsgTemplateCreateRequest;

    hasDeeplinkAction(): boolean;
    clearDeeplinkAction(): void;
    getDeeplinkAction(): string | undefined;
    setDeeplinkAction(value: string): MsgTemplateCreateRequest;

    hasDeeplinkScreen(): boolean;
    clearDeeplinkScreen(): void;
    getDeeplinkScreen(): string | undefined;
    setDeeplinkScreen(value: string): MsgTemplateCreateRequest;

    hasExternalUrl(): boolean;
    clearExternalUrl(): void;
    getExternalUrl(): string | undefined;
    setExternalUrl(value: string): MsgTemplateCreateRequest;

    hasStatus(): boolean;
    clearStatus(): void;
    getStatus(): string | undefined;
    setStatus(value: string): MsgTemplateCreateRequest;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): MsgTemplateCreateRequest.AsObject;
    static toObject(includeInstance: boolean, msg: MsgTemplateCreateRequest): MsgTemplateCreateRequest.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: MsgTemplateCreateRequest, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): MsgTemplateCreateRequest;
    static deserializeBinaryFromReader(message: MsgTemplateCreateRequest, reader: jspb.BinaryReader): MsgTemplateCreateRequest;
}

export namespace MsgTemplateCreateRequest {
    export type AsObject = {
        name: string,
        languageCode: string,
        iconName: string,
        title: string,
        body: string,
        shouldSendPush: boolean,
        shouldAddToHistory: boolean,
        shouldAddToBulletin: boolean,
        deeplinkAction?: string,
        deeplinkScreen?: string,
        externalUrl?: string,
        status?: string,
    }
}

export class MsgTemplateCreateResponse extends jspb.Message { 

    hasTemplate(): boolean;
    clearTemplate(): void;
    getTemplate(): MsgTemplate | undefined;
    setTemplate(value?: MsgTemplate): MsgTemplateCreateResponse;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): MsgTemplateCreateResponse.AsObject;
    static toObject(includeInstance: boolean, msg: MsgTemplateCreateResponse): MsgTemplateCreateResponse.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: MsgTemplateCreateResponse, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): MsgTemplateCreateResponse;
    static deserializeBinaryFromReader(message: MsgTemplateCreateResponse, reader: jspb.BinaryReader): MsgTemplateCreateResponse;
}

export namespace MsgTemplateCreateResponse {
    export type AsObject = {
        template?: MsgTemplate.AsObject,
    }
}

export class MsgTemplateUpdateRequest extends jspb.Message { 
    getId(): string;
    setId(value: string): MsgTemplateUpdateRequest;
    getName(): string;
    setName(value: string): MsgTemplateUpdateRequest;
    getLanguageCode(): string;
    setLanguageCode(value: string): MsgTemplateUpdateRequest;
    getIconName(): string;
    setIconName(value: string): MsgTemplateUpdateRequest;
    getTitle(): string;
    setTitle(value: string): MsgTemplateUpdateRequest;
    getBody(): string;
    setBody(value: string): MsgTemplateUpdateRequest;
    getShouldSendPush(): boolean;
    setShouldSendPush(value: boolean): MsgTemplateUpdateRequest;
    getShouldAddToHistory(): boolean;
    setShouldAddToHistory(value: boolean): MsgTemplateUpdateRequest;
    getShouldAddToBulletin(): boolean;
    setShouldAddToBulletin(value: boolean): MsgTemplateUpdateRequest;

    hasDeeplinkAction(): boolean;
    clearDeeplinkAction(): void;
    getDeeplinkAction(): string | undefined;
    setDeeplinkAction(value: string): MsgTemplateUpdateRequest;

    hasDeeplinkScreen(): boolean;
    clearDeeplinkScreen(): void;
    getDeeplinkScreen(): string | undefined;
    setDeeplinkScreen(value: string): MsgTemplateUpdateRequest;

    hasExternalUrl(): boolean;
    clearExternalUrl(): void;
    getExternalUrl(): string | undefined;
    setExternalUrl(value: string): MsgTemplateUpdateRequest;

    hasStatus(): boolean;
    clearStatus(): void;
    getStatus(): string | undefined;
    setStatus(value: string): MsgTemplateUpdateRequest;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): MsgTemplateUpdateRequest.AsObject;
    static toObject(includeInstance: boolean, msg: MsgTemplateUpdateRequest): MsgTemplateUpdateRequest.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: MsgTemplateUpdateRequest, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): MsgTemplateUpdateRequest;
    static deserializeBinaryFromReader(message: MsgTemplateUpdateRequest, reader: jspb.BinaryReader): MsgTemplateUpdateRequest;
}

export namespace MsgTemplateUpdateRequest {
    export type AsObject = {
        id: string,
        name: string,
        languageCode: string,
        iconName: string,
        title: string,
        body: string,
        shouldSendPush: boolean,
        shouldAddToHistory: boolean,
        shouldAddToBulletin: boolean,
        deeplinkAction?: string,
        deeplinkScreen?: string,
        externalUrl?: string,
        status?: string,
    }
}

export class MsgTemplateUpdateResponse extends jspb.Message { 

    hasTemplate(): boolean;
    clearTemplate(): void;
    getTemplate(): MsgTemplate | undefined;
    setTemplate(value?: MsgTemplate): MsgTemplateUpdateResponse;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): MsgTemplateUpdateResponse.AsObject;
    static toObject(includeInstance: boolean, msg: MsgTemplateUpdateResponse): MsgTemplateUpdateResponse.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: MsgTemplateUpdateResponse, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): MsgTemplateUpdateResponse;
    static deserializeBinaryFromReader(message: MsgTemplateUpdateResponse, reader: jspb.BinaryReader): MsgTemplateUpdateResponse;
}

export namespace MsgTemplateUpdateResponse {
    export type AsObject = {
        template?: MsgTemplate.AsObject,
    }
}

export class MsgTemplateDeleteRequest extends jspb.Message { 
    getId(): string;
    setId(value: string): MsgTemplateDeleteRequest;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): MsgTemplateDeleteRequest.AsObject;
    static toObject(includeInstance: boolean, msg: MsgTemplateDeleteRequest): MsgTemplateDeleteRequest.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: MsgTemplateDeleteRequest, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): MsgTemplateDeleteRequest;
    static deserializeBinaryFromReader(message: MsgTemplateDeleteRequest, reader: jspb.BinaryReader): MsgTemplateDeleteRequest;
}

export namespace MsgTemplateDeleteRequest {
    export type AsObject = {
        id: string,
    }
}

export class MsgTemplateDeleteResponse extends jspb.Message { 
    getId(): string;
    setId(value: string): MsgTemplateDeleteResponse;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): MsgTemplateDeleteResponse.AsObject;
    static toObject(includeInstance: boolean, msg: MsgTemplateDeleteResponse): MsgTemplateDeleteResponse.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: MsgTemplateDeleteResponse, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): MsgTemplateDeleteResponse;
    static deserializeBinaryFromReader(message: MsgTemplateDeleteResponse, reader: jspb.BinaryReader): MsgTemplateDeleteResponse;
}

export namespace MsgTemplateDeleteResponse {
    export type AsObject = {
        id: string,
    }
}

export class MsgTemplatesListRequest extends jspb.Message { 
    getLanguageCode(): string;
    setLanguageCode(value: string): MsgTemplatesListRequest;
    getLimit(): number;
    setLimit(value: number): MsgTemplatesListRequest;
    getOffset(): number;
    setOffset(value: number): MsgTemplatesListRequest;
    getStatus(): string;
    setStatus(value: string): MsgTemplatesListRequest;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): MsgTemplatesListRequest.AsObject;
    static toObject(includeInstance: boolean, msg: MsgTemplatesListRequest): MsgTemplatesListRequest.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: MsgTemplatesListRequest, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): MsgTemplatesListRequest;
    static deserializeBinaryFromReader(message: MsgTemplatesListRequest, reader: jspb.BinaryReader): MsgTemplatesListRequest;
}

export namespace MsgTemplatesListRequest {
    export type AsObject = {
        languageCode: string,
        limit: number,
        offset: number,
        status: string,
    }
}

export class MsgTemplatesListResponse extends jspb.Message { 
    clearTemplatesList(): void;
    getTemplatesList(): Array<MsgTemplate>;
    setTemplatesList(value: Array<MsgTemplate>): MsgTemplatesListResponse;
    addTemplates(value?: MsgTemplate, index?: number): MsgTemplate;
    getTotal(): number;
    setTotal(value: number): MsgTemplatesListResponse;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): MsgTemplatesListResponse.AsObject;
    static toObject(includeInstance: boolean, msg: MsgTemplatesListResponse): MsgTemplatesListResponse.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: MsgTemplatesListResponse, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): MsgTemplatesListResponse;
    static deserializeBinaryFromReader(message: MsgTemplatesListResponse, reader: jspb.BinaryReader): MsgTemplatesListResponse;
}

export namespace MsgTemplatesListResponse {
    export type AsObject = {
        templatesList: Array<MsgTemplate.AsObject>,
        total: number,
    }
}

export class MsgMessageCreateRequest extends jspb.Message { 
    getUsername(): string;
    setUsername(value: string): MsgMessageCreateRequest;
    getStatus(): string;
    setStatus(value: string): MsgMessageCreateRequest;
    getSentBy(): string;
    setSentBy(value: string): MsgMessageCreateRequest;
    getTemplateId(): string;
    setTemplateId(value: string): MsgMessageCreateRequest;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): MsgMessageCreateRequest.AsObject;
    static toObject(includeInstance: boolean, msg: MsgMessageCreateRequest): MsgMessageCreateRequest.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: MsgMessageCreateRequest, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): MsgMessageCreateRequest;
    static deserializeBinaryFromReader(message: MsgMessageCreateRequest, reader: jspb.BinaryReader): MsgMessageCreateRequest;
}

export namespace MsgMessageCreateRequest {
    export type AsObject = {
        username: string,
        status: string,
        sentBy: string,
        templateId: string,
    }
}

export class MsgMessageCreateResponse extends jspb.Message { 

    hasMessage(): boolean;
    clearMessage(): void;
    getMessage(): MsgMessage | undefined;
    setMessage(value?: MsgMessage): MsgMessageCreateResponse;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): MsgMessageCreateResponse.AsObject;
    static toObject(includeInstance: boolean, msg: MsgMessageCreateResponse): MsgMessageCreateResponse.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: MsgMessageCreateResponse, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): MsgMessageCreateResponse;
    static deserializeBinaryFromReader(message: MsgMessageCreateResponse, reader: jspb.BinaryReader): MsgMessageCreateResponse;
}

export namespace MsgMessageCreateResponse {
    export type AsObject = {
        message?: MsgMessage.AsObject,
    }
}

export class MsgMessageUpdateStatusRequest extends jspb.Message { 
    getId(): string;
    setId(value: string): MsgMessageUpdateStatusRequest;
    getStatus(): string;
    setStatus(value: string): MsgMessageUpdateStatusRequest;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): MsgMessageUpdateStatusRequest.AsObject;
    static toObject(includeInstance: boolean, msg: MsgMessageUpdateStatusRequest): MsgMessageUpdateStatusRequest.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: MsgMessageUpdateStatusRequest, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): MsgMessageUpdateStatusRequest;
    static deserializeBinaryFromReader(message: MsgMessageUpdateStatusRequest, reader: jspb.BinaryReader): MsgMessageUpdateStatusRequest;
}

export namespace MsgMessageUpdateStatusRequest {
    export type AsObject = {
        id: string,
        status: string,
    }
}

export class MsgMessageUpdateStatusResponse extends jspb.Message { 

    hasMessage(): boolean;
    clearMessage(): void;
    getMessage(): MsgMessage | undefined;
    setMessage(value?: MsgMessage): MsgMessageUpdateStatusResponse;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): MsgMessageUpdateStatusResponse.AsObject;
    static toObject(includeInstance: boolean, msg: MsgMessageUpdateStatusResponse): MsgMessageUpdateStatusResponse.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: MsgMessageUpdateStatusResponse, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): MsgMessageUpdateStatusResponse;
    static deserializeBinaryFromReader(message: MsgMessageUpdateStatusResponse, reader: jspb.BinaryReader): MsgMessageUpdateStatusResponse;
}

export namespace MsgMessageUpdateStatusResponse {
    export type AsObject = {
        message?: MsgMessage.AsObject,
    }
}

export class MsgMessagesListRequest extends jspb.Message { 
    getUsername(): string;
    setUsername(value: string): MsgMessagesListRequest;
    getStatus(): string;
    setStatus(value: string): MsgMessagesListRequest;
    getUpdatedAtFrom(): number;
    setUpdatedAtFrom(value: number): MsgMessagesListRequest;
    getUpdatedAtTo(): number;
    setUpdatedAtTo(value: number): MsgMessagesListRequest;
    getLimit(): number;
    setLimit(value: number): MsgMessagesListRequest;
    getOffset(): number;
    setOffset(value: number): MsgMessagesListRequest;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): MsgMessagesListRequest.AsObject;
    static toObject(includeInstance: boolean, msg: MsgMessagesListRequest): MsgMessagesListRequest.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: MsgMessagesListRequest, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): MsgMessagesListRequest;
    static deserializeBinaryFromReader(message: MsgMessagesListRequest, reader: jspb.BinaryReader): MsgMessagesListRequest;
}

export namespace MsgMessagesListRequest {
    export type AsObject = {
        username: string,
        status: string,
        updatedAtFrom: number,
        updatedAtTo: number,
        limit: number,
        offset: number,
    }
}

export class MsgMessagesListResponse extends jspb.Message { 
    clearMessagesList(): void;
    getMessagesList(): Array<MsgMessage>;
    setMessagesList(value: Array<MsgMessage>): MsgMessagesListResponse;
    addMessages(value?: MsgMessage, index?: number): MsgMessage;
    getTotal(): number;
    setTotal(value: number): MsgMessagesListResponse;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): MsgMessagesListResponse.AsObject;
    static toObject(includeInstance: boolean, msg: MsgMessagesListResponse): MsgMessagesListResponse.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: MsgMessagesListResponse, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): MsgMessagesListResponse;
    static deserializeBinaryFromReader(message: MsgMessagesListResponse, reader: jspb.BinaryReader): MsgMessagesListResponse;
}

export namespace MsgMessagesListResponse {
    export type AsObject = {
        messagesList: Array<MsgMessage.AsObject>,
        total: number,
    }
}

export class MsgMessageHistoryListRequest extends jspb.Message { 
    getId(): string;
    setId(value: string): MsgMessageHistoryListRequest;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): MsgMessageHistoryListRequest.AsObject;
    static toObject(includeInstance: boolean, msg: MsgMessageHistoryListRequest): MsgMessageHistoryListRequest.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: MsgMessageHistoryListRequest, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): MsgMessageHistoryListRequest;
    static deserializeBinaryFromReader(message: MsgMessageHistoryListRequest, reader: jspb.BinaryReader): MsgMessageHistoryListRequest;
}

export namespace MsgMessageHistoryListRequest {
    export type AsObject = {
        id: string,
    }
}

export class MsgMessageHistoryItem extends jspb.Message { 
    getId(): string;
    setId(value: string): MsgMessageHistoryItem;
    getStatus(): string;
    setStatus(value: string): MsgMessageHistoryItem;
    getCreatedAt(): number;
    setCreatedAt(value: number): MsgMessageHistoryItem;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): MsgMessageHistoryItem.AsObject;
    static toObject(includeInstance: boolean, msg: MsgMessageHistoryItem): MsgMessageHistoryItem.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: MsgMessageHistoryItem, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): MsgMessageHistoryItem;
    static deserializeBinaryFromReader(message: MsgMessageHistoryItem, reader: jspb.BinaryReader): MsgMessageHistoryItem;
}

export namespace MsgMessageHistoryItem {
    export type AsObject = {
        id: string,
        status: string,
        createdAt: number,
    }
}

export class MsgMessageHistoryListResponse extends jspb.Message { 
    clearHistoryList(): void;
    getHistoryList(): Array<MsgMessageHistoryItem>;
    setHistoryList(value: Array<MsgMessageHistoryItem>): MsgMessageHistoryListResponse;
    addHistory(value?: MsgMessageHistoryItem, index?: number): MsgMessageHistoryItem;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): MsgMessageHistoryListResponse.AsObject;
    static toObject(includeInstance: boolean, msg: MsgMessageHistoryListResponse): MsgMessageHistoryListResponse.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: MsgMessageHistoryListResponse, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): MsgMessageHistoryListResponse;
    static deserializeBinaryFromReader(message: MsgMessageHistoryListResponse, reader: jspb.BinaryReader): MsgMessageHistoryListResponse;
}

export namespace MsgMessageHistoryListResponse {
    export type AsObject = {
        historyList: Array<MsgMessageHistoryItem.AsObject>,
    }
}

export class MsgTemplateByIdRequest extends jspb.Message { 
    getId(): string;
    setId(value: string): MsgTemplateByIdRequest;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): MsgTemplateByIdRequest.AsObject;
    static toObject(includeInstance: boolean, msg: MsgTemplateByIdRequest): MsgTemplateByIdRequest.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: MsgTemplateByIdRequest, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): MsgTemplateByIdRequest;
    static deserializeBinaryFromReader(message: MsgTemplateByIdRequest, reader: jspb.BinaryReader): MsgTemplateByIdRequest;
}

export namespace MsgTemplateByIdRequest {
    export type AsObject = {
        id: string,
    }
}

export class MsgTemplateByIdResponse extends jspb.Message { 

    hasTemplate(): boolean;
    clearTemplate(): void;
    getTemplate(): MsgTemplate | undefined;
    setTemplate(value?: MsgTemplate): MsgTemplateByIdResponse;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): MsgTemplateByIdResponse.AsObject;
    static toObject(includeInstance: boolean, msg: MsgTemplateByIdResponse): MsgTemplateByIdResponse.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: MsgTemplateByIdResponse, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): MsgTemplateByIdResponse;
    static deserializeBinaryFromReader(message: MsgTemplateByIdResponse, reader: jspb.BinaryReader): MsgTemplateByIdResponse;
}

export namespace MsgTemplateByIdResponse {
    export type AsObject = {
        template?: MsgTemplate.AsObject,
    }
}

export enum NotificationChannel {
    PUSH = 0,
}

export enum NotificationCategory {
    CIRCLES = 0,
    PAYMENTS = 1,
    ADMIN_NOTIFICATION = 3,
    MARKETING = 4,
    PRICE = 5,
}

export enum CircleType {
    INNER = 0,
    OUTER = 1,
}

export enum CircleTimeFrame {
    MONTH = 0,
    ALL_TIME = 1,
}

export enum DeclinedReason {
    DOCUMENTS_NOT_CLEAR = 0,
    VERIFICATION_PHOTO_NOT_CLEAR = 1,
    DOCUMENTS_NOT_SUPPORTED = 2,
    DOCUMENTS_EXPIRED = 3,
    DOCUMENTS_DO_NOT_MATCH = 4,
    OTHER = 5,
}

export enum TransactionType {
    INTRA_LEDGER_RECEIPT = 0,
    INTRA_LEDGER_PAYMENT = 1,
    ONCHAIN_RECEIPT = 2,
    ONCHAIN_RECEIPT_PENDING = 3,
    ONCHAIN_PAYMENT = 4,
    LIGHTNING_RECEIPT = 5,
    LIGHTNING_PAYMENT = 6,
}

export enum PriceChangeDirection {
    UP = 0,
    DOWN = 1,
}

export enum DeepLinkScreen {
    CIRCLES = 0,
    PRICE = 1,
    EARN = 2,
    MAP = 3,
    PEOPLE = 4,
    HOME = 5,
    RECEIVE = 6,
    CONVERT = 7,
    SCANQR = 8,
    CHAT = 9,
    SETTINGS = 10,
    SETTINGS2FA = 11,
    SETTINGSDISPLAYCURRENCY = 12,
    SETTINGSDEFAULTACCOUNT = 13,
    SETTINGSLANGUAGE = 14,
    SETTINGSTHEME = 15,
    SETTINGSSECURITY = 16,
    SETTINGSACCOUNT = 17,
    SETTINGSTXLIMITS = 18,
    SETTINGSNOTIFICATIONS = 19,
    SETTINGSEMAIL = 20,
    WELCOMECARD = 21,
    LOADINGCARD = 22,
    VISACARD = 23,
    CREDITCARDLIMIT = 24,
}

export enum DeepLinkAction {
    SETLNADDRESSMODAL = 0,
    SETDEFAULTACCOUNTMODAL = 1,
    UPGRADEACCOUNTMODAL = 2,
}

export enum Icon {
    ARROWRIGHT = 0,
    ARROWLEFT = 1,
    BACKSPACE = 2,
    BANK = 3,
    BITCOIN = 4,
    BOOK = 5,
    BTCBOOK = 6,
    CARETDOWN = 7,
    CARETLEFT = 8,
    CARETRIGHT = 9,
    CARETUP = 10,
    CHECKCIRCLE = 11,
    CHECK = 12,
    CLOSE = 13,
    CLOSECROSSWITHBACKGROUND = 14,
    COINS = 15,
    PEOPLEICON = 16,
    COPYPASTE = 17,
    DOLLAR = 18,
    EYESLASH = 19,
    EYE = 20,
    FILTER = 21,
    GLOBE = 22,
    GRAPH = 23,
    IMAGE = 24,
    INFO = 25,
    LIGHTNING = 26,
    LINK = 27,
    LOADING = 28,
    MAGNIFYINGGLASS = 29,
    MAPICON = 30,
    MENU = 31,
    PENCIL = 32,
    NOTE = 33,
    RANK = 34,
    QRCODE = 35,
    QUESTION = 36,
    RECEIVEICON = 37,
    SEND = 38,
    SETTINGSICON = 39,
    SHARE = 40,
    TRANSFER = 41,
    USER = 42,
    VIDEO = 43,
    WARNING = 44,
    WARNINGWITHBACKGROUND = 45,
    PAYMENTSUCCESS = 46,
    PAYMENTPENDING = 47,
    PAYMENTERROR = 48,
    BELL = 49,
    REFRESH = 50,
}

export enum MsgMessageStatus {
    INVITED = 0,
    BANNER_CLICKED = 1,
    INVITATION_INFO_COMPLETED = 2,
    KYC_INITIATED = 3,
    KYC_PASSED = 4,
    CARD_INFO_SUBMITTED = 5,
    CARD_APPROVED = 6,
    INVITE_WITHDRAWN = 7,
    KYC_FAILED = 8,
    CARD_DENIED = 9,
}
