// GENERATED CODE -- DO NOT EDIT!

'use strict';
var grpc = require('@grpc/grpc-js');
var notifications_pb = require('./notifications_pb.js');

function serialize_services_notifications_v1_AddPushDeviceTokenRequest(arg) {
  if (!(arg instanceof notifications_pb.AddPushDeviceTokenRequest)) {
    throw new Error('Expected argument of type services.notifications.v1.AddPushDeviceTokenRequest');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_services_notifications_v1_AddPushDeviceTokenRequest(buffer_arg) {
  return notifications_pb.AddPushDeviceTokenRequest.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_services_notifications_v1_AddPushDeviceTokenResponse(arg) {
  if (!(arg instanceof notifications_pb.AddPushDeviceTokenResponse)) {
    throw new Error('Expected argument of type services.notifications.v1.AddPushDeviceTokenResponse');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_services_notifications_v1_AddPushDeviceTokenResponse(buffer_arg) {
  return notifications_pb.AddPushDeviceTokenResponse.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_services_notifications_v1_DisableNotificationCategoryRequest(arg) {
  if (!(arg instanceof notifications_pb.DisableNotificationCategoryRequest)) {
    throw new Error('Expected argument of type services.notifications.v1.DisableNotificationCategoryRequest');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_services_notifications_v1_DisableNotificationCategoryRequest(buffer_arg) {
  return notifications_pb.DisableNotificationCategoryRequest.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_services_notifications_v1_DisableNotificationCategoryResponse(arg) {
  if (!(arg instanceof notifications_pb.DisableNotificationCategoryResponse)) {
    throw new Error('Expected argument of type services.notifications.v1.DisableNotificationCategoryResponse');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_services_notifications_v1_DisableNotificationCategoryResponse(buffer_arg) {
  return notifications_pb.DisableNotificationCategoryResponse.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_services_notifications_v1_DisableNotificationChannelRequest(arg) {
  if (!(arg instanceof notifications_pb.DisableNotificationChannelRequest)) {
    throw new Error('Expected argument of type services.notifications.v1.DisableNotificationChannelRequest');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_services_notifications_v1_DisableNotificationChannelRequest(buffer_arg) {
  return notifications_pb.DisableNotificationChannelRequest.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_services_notifications_v1_DisableNotificationChannelResponse(arg) {
  if (!(arg instanceof notifications_pb.DisableNotificationChannelResponse)) {
    throw new Error('Expected argument of type services.notifications.v1.DisableNotificationChannelResponse');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_services_notifications_v1_DisableNotificationChannelResponse(buffer_arg) {
  return notifications_pb.DisableNotificationChannelResponse.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_services_notifications_v1_EnableNotificationCategoryRequest(arg) {
  if (!(arg instanceof notifications_pb.EnableNotificationCategoryRequest)) {
    throw new Error('Expected argument of type services.notifications.v1.EnableNotificationCategoryRequest');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_services_notifications_v1_EnableNotificationCategoryRequest(buffer_arg) {
  return notifications_pb.EnableNotificationCategoryRequest.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_services_notifications_v1_EnableNotificationCategoryResponse(arg) {
  if (!(arg instanceof notifications_pb.EnableNotificationCategoryResponse)) {
    throw new Error('Expected argument of type services.notifications.v1.EnableNotificationCategoryResponse');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_services_notifications_v1_EnableNotificationCategoryResponse(buffer_arg) {
  return notifications_pb.EnableNotificationCategoryResponse.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_services_notifications_v1_EnableNotificationChannelRequest(arg) {
  if (!(arg instanceof notifications_pb.EnableNotificationChannelRequest)) {
    throw new Error('Expected argument of type services.notifications.v1.EnableNotificationChannelRequest');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_services_notifications_v1_EnableNotificationChannelRequest(buffer_arg) {
  return notifications_pb.EnableNotificationChannelRequest.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_services_notifications_v1_EnableNotificationChannelResponse(arg) {
  if (!(arg instanceof notifications_pb.EnableNotificationChannelResponse)) {
    throw new Error('Expected argument of type services.notifications.v1.EnableNotificationChannelResponse');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_services_notifications_v1_EnableNotificationChannelResponse(buffer_arg) {
  return notifications_pb.EnableNotificationChannelResponse.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_services_notifications_v1_GetNotificationSettingsRequest(arg) {
  if (!(arg instanceof notifications_pb.GetNotificationSettingsRequest)) {
    throw new Error('Expected argument of type services.notifications.v1.GetNotificationSettingsRequest');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_services_notifications_v1_GetNotificationSettingsRequest(buffer_arg) {
  return notifications_pb.GetNotificationSettingsRequest.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_services_notifications_v1_GetNotificationSettingsResponse(arg) {
  if (!(arg instanceof notifications_pb.GetNotificationSettingsResponse)) {
    throw new Error('Expected argument of type services.notifications.v1.GetNotificationSettingsResponse');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_services_notifications_v1_GetNotificationSettingsResponse(buffer_arg) {
  return notifications_pb.GetNotificationSettingsResponse.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_services_notifications_v1_HandleNotificationEventRequest(arg) {
  if (!(arg instanceof notifications_pb.HandleNotificationEventRequest)) {
    throw new Error('Expected argument of type services.notifications.v1.HandleNotificationEventRequest');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_services_notifications_v1_HandleNotificationEventRequest(buffer_arg) {
  return notifications_pb.HandleNotificationEventRequest.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_services_notifications_v1_HandleNotificationEventResponse(arg) {
  if (!(arg instanceof notifications_pb.HandleNotificationEventResponse)) {
    throw new Error('Expected argument of type services.notifications.v1.HandleNotificationEventResponse');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_services_notifications_v1_HandleNotificationEventResponse(buffer_arg) {
  return notifications_pb.HandleNotificationEventResponse.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_services_notifications_v1_MsgMessageCreateRequest(arg) {
  if (!(arg instanceof notifications_pb.MsgMessageCreateRequest)) {
    throw new Error('Expected argument of type services.notifications.v1.MsgMessageCreateRequest');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_services_notifications_v1_MsgMessageCreateRequest(buffer_arg) {
  return notifications_pb.MsgMessageCreateRequest.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_services_notifications_v1_MsgMessageCreateResponse(arg) {
  if (!(arg instanceof notifications_pb.MsgMessageCreateResponse)) {
    throw new Error('Expected argument of type services.notifications.v1.MsgMessageCreateResponse');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_services_notifications_v1_MsgMessageCreateResponse(buffer_arg) {
  return notifications_pb.MsgMessageCreateResponse.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_services_notifications_v1_MsgMessageHistoryListRequest(arg) {
  if (!(arg instanceof notifications_pb.MsgMessageHistoryListRequest)) {
    throw new Error('Expected argument of type services.notifications.v1.MsgMessageHistoryListRequest');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_services_notifications_v1_MsgMessageHistoryListRequest(buffer_arg) {
  return notifications_pb.MsgMessageHistoryListRequest.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_services_notifications_v1_MsgMessageHistoryListResponse(arg) {
  if (!(arg instanceof notifications_pb.MsgMessageHistoryListResponse)) {
    throw new Error('Expected argument of type services.notifications.v1.MsgMessageHistoryListResponse');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_services_notifications_v1_MsgMessageHistoryListResponse(buffer_arg) {
  return notifications_pb.MsgMessageHistoryListResponse.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_services_notifications_v1_MsgMessageUpdateStatusRequest(arg) {
  if (!(arg instanceof notifications_pb.MsgMessageUpdateStatusRequest)) {
    throw new Error('Expected argument of type services.notifications.v1.MsgMessageUpdateStatusRequest');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_services_notifications_v1_MsgMessageUpdateStatusRequest(buffer_arg) {
  return notifications_pb.MsgMessageUpdateStatusRequest.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_services_notifications_v1_MsgMessageUpdateStatusResponse(arg) {
  if (!(arg instanceof notifications_pb.MsgMessageUpdateStatusResponse)) {
    throw new Error('Expected argument of type services.notifications.v1.MsgMessageUpdateStatusResponse');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_services_notifications_v1_MsgMessageUpdateStatusResponse(buffer_arg) {
  return notifications_pb.MsgMessageUpdateStatusResponse.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_services_notifications_v1_MsgMessagesListRequest(arg) {
  if (!(arg instanceof notifications_pb.MsgMessagesListRequest)) {
    throw new Error('Expected argument of type services.notifications.v1.MsgMessagesListRequest');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_services_notifications_v1_MsgMessagesListRequest(buffer_arg) {
  return notifications_pb.MsgMessagesListRequest.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_services_notifications_v1_MsgMessagesListResponse(arg) {
  if (!(arg instanceof notifications_pb.MsgMessagesListResponse)) {
    throw new Error('Expected argument of type services.notifications.v1.MsgMessagesListResponse');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_services_notifications_v1_MsgMessagesListResponse(buffer_arg) {
  return notifications_pb.MsgMessagesListResponse.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_services_notifications_v1_MsgTemplateByIdRequest(arg) {
  if (!(arg instanceof notifications_pb.MsgTemplateByIdRequest)) {
    throw new Error('Expected argument of type services.notifications.v1.MsgTemplateByIdRequest');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_services_notifications_v1_MsgTemplateByIdRequest(buffer_arg) {
  return notifications_pb.MsgTemplateByIdRequest.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_services_notifications_v1_MsgTemplateByIdResponse(arg) {
  if (!(arg instanceof notifications_pb.MsgTemplateByIdResponse)) {
    throw new Error('Expected argument of type services.notifications.v1.MsgTemplateByIdResponse');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_services_notifications_v1_MsgTemplateByIdResponse(buffer_arg) {
  return notifications_pb.MsgTemplateByIdResponse.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_services_notifications_v1_MsgTemplateCreateRequest(arg) {
  if (!(arg instanceof notifications_pb.MsgTemplateCreateRequest)) {
    throw new Error('Expected argument of type services.notifications.v1.MsgTemplateCreateRequest');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_services_notifications_v1_MsgTemplateCreateRequest(buffer_arg) {
  return notifications_pb.MsgTemplateCreateRequest.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_services_notifications_v1_MsgTemplateCreateResponse(arg) {
  if (!(arg instanceof notifications_pb.MsgTemplateCreateResponse)) {
    throw new Error('Expected argument of type services.notifications.v1.MsgTemplateCreateResponse');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_services_notifications_v1_MsgTemplateCreateResponse(buffer_arg) {
  return notifications_pb.MsgTemplateCreateResponse.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_services_notifications_v1_MsgTemplateDeleteRequest(arg) {
  if (!(arg instanceof notifications_pb.MsgTemplateDeleteRequest)) {
    throw new Error('Expected argument of type services.notifications.v1.MsgTemplateDeleteRequest');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_services_notifications_v1_MsgTemplateDeleteRequest(buffer_arg) {
  return notifications_pb.MsgTemplateDeleteRequest.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_services_notifications_v1_MsgTemplateDeleteResponse(arg) {
  if (!(arg instanceof notifications_pb.MsgTemplateDeleteResponse)) {
    throw new Error('Expected argument of type services.notifications.v1.MsgTemplateDeleteResponse');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_services_notifications_v1_MsgTemplateDeleteResponse(buffer_arg) {
  return notifications_pb.MsgTemplateDeleteResponse.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_services_notifications_v1_MsgTemplateUpdateRequest(arg) {
  if (!(arg instanceof notifications_pb.MsgTemplateUpdateRequest)) {
    throw new Error('Expected argument of type services.notifications.v1.MsgTemplateUpdateRequest');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_services_notifications_v1_MsgTemplateUpdateRequest(buffer_arg) {
  return notifications_pb.MsgTemplateUpdateRequest.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_services_notifications_v1_MsgTemplateUpdateResponse(arg) {
  if (!(arg instanceof notifications_pb.MsgTemplateUpdateResponse)) {
    throw new Error('Expected argument of type services.notifications.v1.MsgTemplateUpdateResponse');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_services_notifications_v1_MsgTemplateUpdateResponse(buffer_arg) {
  return notifications_pb.MsgTemplateUpdateResponse.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_services_notifications_v1_MsgTemplatesListRequest(arg) {
  if (!(arg instanceof notifications_pb.MsgTemplatesListRequest)) {
    throw new Error('Expected argument of type services.notifications.v1.MsgTemplatesListRequest');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_services_notifications_v1_MsgTemplatesListRequest(buffer_arg) {
  return notifications_pb.MsgTemplatesListRequest.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_services_notifications_v1_MsgTemplatesListResponse(arg) {
  if (!(arg instanceof notifications_pb.MsgTemplatesListResponse)) {
    throw new Error('Expected argument of type services.notifications.v1.MsgTemplatesListResponse');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_services_notifications_v1_MsgTemplatesListResponse(buffer_arg) {
  return notifications_pb.MsgTemplatesListResponse.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_services_notifications_v1_RemoveEmailAddressRequest(arg) {
  if (!(arg instanceof notifications_pb.RemoveEmailAddressRequest)) {
    throw new Error('Expected argument of type services.notifications.v1.RemoveEmailAddressRequest');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_services_notifications_v1_RemoveEmailAddressRequest(buffer_arg) {
  return notifications_pb.RemoveEmailAddressRequest.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_services_notifications_v1_RemoveEmailAddressResponse(arg) {
  if (!(arg instanceof notifications_pb.RemoveEmailAddressResponse)) {
    throw new Error('Expected argument of type services.notifications.v1.RemoveEmailAddressResponse');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_services_notifications_v1_RemoveEmailAddressResponse(buffer_arg) {
  return notifications_pb.RemoveEmailAddressResponse.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_services_notifications_v1_RemovePushDeviceTokenRequest(arg) {
  if (!(arg instanceof notifications_pb.RemovePushDeviceTokenRequest)) {
    throw new Error('Expected argument of type services.notifications.v1.RemovePushDeviceTokenRequest');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_services_notifications_v1_RemovePushDeviceTokenRequest(buffer_arg) {
  return notifications_pb.RemovePushDeviceTokenRequest.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_services_notifications_v1_RemovePushDeviceTokenResponse(arg) {
  if (!(arg instanceof notifications_pb.RemovePushDeviceTokenResponse)) {
    throw new Error('Expected argument of type services.notifications.v1.RemovePushDeviceTokenResponse');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_services_notifications_v1_RemovePushDeviceTokenResponse(buffer_arg) {
  return notifications_pb.RemovePushDeviceTokenResponse.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_services_notifications_v1_UpdateEmailAddressRequest(arg) {
  if (!(arg instanceof notifications_pb.UpdateEmailAddressRequest)) {
    throw new Error('Expected argument of type services.notifications.v1.UpdateEmailAddressRequest');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_services_notifications_v1_UpdateEmailAddressRequest(buffer_arg) {
  return notifications_pb.UpdateEmailAddressRequest.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_services_notifications_v1_UpdateEmailAddressResponse(arg) {
  if (!(arg instanceof notifications_pb.UpdateEmailAddressResponse)) {
    throw new Error('Expected argument of type services.notifications.v1.UpdateEmailAddressResponse');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_services_notifications_v1_UpdateEmailAddressResponse(buffer_arg) {
  return notifications_pb.UpdateEmailAddressResponse.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_services_notifications_v1_UpdateUserLocaleRequest(arg) {
  if (!(arg instanceof notifications_pb.UpdateUserLocaleRequest)) {
    throw new Error('Expected argument of type services.notifications.v1.UpdateUserLocaleRequest');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_services_notifications_v1_UpdateUserLocaleRequest(buffer_arg) {
  return notifications_pb.UpdateUserLocaleRequest.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_services_notifications_v1_UpdateUserLocaleResponse(arg) {
  if (!(arg instanceof notifications_pb.UpdateUserLocaleResponse)) {
    throw new Error('Expected argument of type services.notifications.v1.UpdateUserLocaleResponse');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_services_notifications_v1_UpdateUserLocaleResponse(buffer_arg) {
  return notifications_pb.UpdateUserLocaleResponse.deserializeBinary(new Uint8Array(buffer_arg));
}


var NotificationsServiceService = exports.NotificationsServiceService = {
  enableNotificationChannel: {
    path: '/services.notifications.v1.NotificationsService/EnableNotificationChannel',
    requestStream: false,
    responseStream: false,
    requestType: notifications_pb.EnableNotificationChannelRequest,
    responseType: notifications_pb.EnableNotificationChannelResponse,
    requestSerialize: serialize_services_notifications_v1_EnableNotificationChannelRequest,
    requestDeserialize: deserialize_services_notifications_v1_EnableNotificationChannelRequest,
    responseSerialize: serialize_services_notifications_v1_EnableNotificationChannelResponse,
    responseDeserialize: deserialize_services_notifications_v1_EnableNotificationChannelResponse,
  },
  disableNotificationChannel: {
    path: '/services.notifications.v1.NotificationsService/DisableNotificationChannel',
    requestStream: false,
    responseStream: false,
    requestType: notifications_pb.DisableNotificationChannelRequest,
    responseType: notifications_pb.DisableNotificationChannelResponse,
    requestSerialize: serialize_services_notifications_v1_DisableNotificationChannelRequest,
    requestDeserialize: deserialize_services_notifications_v1_DisableNotificationChannelRequest,
    responseSerialize: serialize_services_notifications_v1_DisableNotificationChannelResponse,
    responseDeserialize: deserialize_services_notifications_v1_DisableNotificationChannelResponse,
  },
  enableNotificationCategory: {
    path: '/services.notifications.v1.NotificationsService/EnableNotificationCategory',
    requestStream: false,
    responseStream: false,
    requestType: notifications_pb.EnableNotificationCategoryRequest,
    responseType: notifications_pb.EnableNotificationCategoryResponse,
    requestSerialize: serialize_services_notifications_v1_EnableNotificationCategoryRequest,
    requestDeserialize: deserialize_services_notifications_v1_EnableNotificationCategoryRequest,
    responseSerialize: serialize_services_notifications_v1_EnableNotificationCategoryResponse,
    responseDeserialize: deserialize_services_notifications_v1_EnableNotificationCategoryResponse,
  },
  disableNotificationCategory: {
    path: '/services.notifications.v1.NotificationsService/DisableNotificationCategory',
    requestStream: false,
    responseStream: false,
    requestType: notifications_pb.DisableNotificationCategoryRequest,
    responseType: notifications_pb.DisableNotificationCategoryResponse,
    requestSerialize: serialize_services_notifications_v1_DisableNotificationCategoryRequest,
    requestDeserialize: deserialize_services_notifications_v1_DisableNotificationCategoryRequest,
    responseSerialize: serialize_services_notifications_v1_DisableNotificationCategoryResponse,
    responseDeserialize: deserialize_services_notifications_v1_DisableNotificationCategoryResponse,
  },
  getNotificationSettings: {
    path: '/services.notifications.v1.NotificationsService/GetNotificationSettings',
    requestStream: false,
    responseStream: false,
    requestType: notifications_pb.GetNotificationSettingsRequest,
    responseType: notifications_pb.GetNotificationSettingsResponse,
    requestSerialize: serialize_services_notifications_v1_GetNotificationSettingsRequest,
    requestDeserialize: deserialize_services_notifications_v1_GetNotificationSettingsRequest,
    responseSerialize: serialize_services_notifications_v1_GetNotificationSettingsResponse,
    responseDeserialize: deserialize_services_notifications_v1_GetNotificationSettingsResponse,
  },
  updateUserLocale: {
    path: '/services.notifications.v1.NotificationsService/UpdateUserLocale',
    requestStream: false,
    responseStream: false,
    requestType: notifications_pb.UpdateUserLocaleRequest,
    responseType: notifications_pb.UpdateUserLocaleResponse,
    requestSerialize: serialize_services_notifications_v1_UpdateUserLocaleRequest,
    requestDeserialize: deserialize_services_notifications_v1_UpdateUserLocaleRequest,
    responseSerialize: serialize_services_notifications_v1_UpdateUserLocaleResponse,
    responseDeserialize: deserialize_services_notifications_v1_UpdateUserLocaleResponse,
  },
  addPushDeviceToken: {
    path: '/services.notifications.v1.NotificationsService/AddPushDeviceToken',
    requestStream: false,
    responseStream: false,
    requestType: notifications_pb.AddPushDeviceTokenRequest,
    responseType: notifications_pb.AddPushDeviceTokenResponse,
    requestSerialize: serialize_services_notifications_v1_AddPushDeviceTokenRequest,
    requestDeserialize: deserialize_services_notifications_v1_AddPushDeviceTokenRequest,
    responseSerialize: serialize_services_notifications_v1_AddPushDeviceTokenResponse,
    responseDeserialize: deserialize_services_notifications_v1_AddPushDeviceTokenResponse,
  },
  removePushDeviceToken: {
    path: '/services.notifications.v1.NotificationsService/RemovePushDeviceToken',
    requestStream: false,
    responseStream: false,
    requestType: notifications_pb.RemovePushDeviceTokenRequest,
    responseType: notifications_pb.RemovePushDeviceTokenResponse,
    requestSerialize: serialize_services_notifications_v1_RemovePushDeviceTokenRequest,
    requestDeserialize: deserialize_services_notifications_v1_RemovePushDeviceTokenRequest,
    responseSerialize: serialize_services_notifications_v1_RemovePushDeviceTokenResponse,
    responseDeserialize: deserialize_services_notifications_v1_RemovePushDeviceTokenResponse,
  },
  updateEmailAddress: {
    path: '/services.notifications.v1.NotificationsService/UpdateEmailAddress',
    requestStream: false,
    responseStream: false,
    requestType: notifications_pb.UpdateEmailAddressRequest,
    responseType: notifications_pb.UpdateEmailAddressResponse,
    requestSerialize: serialize_services_notifications_v1_UpdateEmailAddressRequest,
    requestDeserialize: deserialize_services_notifications_v1_UpdateEmailAddressRequest,
    responseSerialize: serialize_services_notifications_v1_UpdateEmailAddressResponse,
    responseDeserialize: deserialize_services_notifications_v1_UpdateEmailAddressResponse,
  },
  removeEmailAddress: {
    path: '/services.notifications.v1.NotificationsService/RemoveEmailAddress',
    requestStream: false,
    responseStream: false,
    requestType: notifications_pb.RemoveEmailAddressRequest,
    responseType: notifications_pb.RemoveEmailAddressResponse,
    requestSerialize: serialize_services_notifications_v1_RemoveEmailAddressRequest,
    requestDeserialize: deserialize_services_notifications_v1_RemoveEmailAddressRequest,
    responseSerialize: serialize_services_notifications_v1_RemoveEmailAddressResponse,
    responseDeserialize: deserialize_services_notifications_v1_RemoveEmailAddressResponse,
  },
  handleNotificationEvent: {
    path: '/services.notifications.v1.NotificationsService/HandleNotificationEvent',
    requestStream: false,
    responseStream: false,
    requestType: notifications_pb.HandleNotificationEventRequest,
    responseType: notifications_pb.HandleNotificationEventResponse,
    requestSerialize: serialize_services_notifications_v1_HandleNotificationEventRequest,
    requestDeserialize: deserialize_services_notifications_v1_HandleNotificationEventRequest,
    responseSerialize: serialize_services_notifications_v1_HandleNotificationEventResponse,
    responseDeserialize: deserialize_services_notifications_v1_HandleNotificationEventResponse,
  },
  msgTemplateCreate: {
    path: '/services.notifications.v1.NotificationsService/MsgTemplateCreate',
    requestStream: false,
    responseStream: false,
    requestType: notifications_pb.MsgTemplateCreateRequest,
    responseType: notifications_pb.MsgTemplateCreateResponse,
    requestSerialize: serialize_services_notifications_v1_MsgTemplateCreateRequest,
    requestDeserialize: deserialize_services_notifications_v1_MsgTemplateCreateRequest,
    responseSerialize: serialize_services_notifications_v1_MsgTemplateCreateResponse,
    responseDeserialize: deserialize_services_notifications_v1_MsgTemplateCreateResponse,
  },
  msgTemplateUpdate: {
    path: '/services.notifications.v1.NotificationsService/MsgTemplateUpdate',
    requestStream: false,
    responseStream: false,
    requestType: notifications_pb.MsgTemplateUpdateRequest,
    responseType: notifications_pb.MsgTemplateUpdateResponse,
    requestSerialize: serialize_services_notifications_v1_MsgTemplateUpdateRequest,
    requestDeserialize: deserialize_services_notifications_v1_MsgTemplateUpdateRequest,
    responseSerialize: serialize_services_notifications_v1_MsgTemplateUpdateResponse,
    responseDeserialize: deserialize_services_notifications_v1_MsgTemplateUpdateResponse,
  },
  msgTemplateDelete: {
    path: '/services.notifications.v1.NotificationsService/MsgTemplateDelete',
    requestStream: false,
    responseStream: false,
    requestType: notifications_pb.MsgTemplateDeleteRequest,
    responseType: notifications_pb.MsgTemplateDeleteResponse,
    requestSerialize: serialize_services_notifications_v1_MsgTemplateDeleteRequest,
    requestDeserialize: deserialize_services_notifications_v1_MsgTemplateDeleteRequest,
    responseSerialize: serialize_services_notifications_v1_MsgTemplateDeleteResponse,
    responseDeserialize: deserialize_services_notifications_v1_MsgTemplateDeleteResponse,
  },
  msgTemplateById: {
    path: '/services.notifications.v1.NotificationsService/MsgTemplateById',
    requestStream: false,
    responseStream: false,
    requestType: notifications_pb.MsgTemplateByIdRequest,
    responseType: notifications_pb.MsgTemplateByIdResponse,
    requestSerialize: serialize_services_notifications_v1_MsgTemplateByIdRequest,
    requestDeserialize: deserialize_services_notifications_v1_MsgTemplateByIdRequest,
    responseSerialize: serialize_services_notifications_v1_MsgTemplateByIdResponse,
    responseDeserialize: deserialize_services_notifications_v1_MsgTemplateByIdResponse,
  },
  msgTemplatesList: {
    path: '/services.notifications.v1.NotificationsService/MsgTemplatesList',
    requestStream: false,
    responseStream: false,
    requestType: notifications_pb.MsgTemplatesListRequest,
    responseType: notifications_pb.MsgTemplatesListResponse,
    requestSerialize: serialize_services_notifications_v1_MsgTemplatesListRequest,
    requestDeserialize: deserialize_services_notifications_v1_MsgTemplatesListRequest,
    responseSerialize: serialize_services_notifications_v1_MsgTemplatesListResponse,
    responseDeserialize: deserialize_services_notifications_v1_MsgTemplatesListResponse,
  },
  msgMessageCreate: {
    path: '/services.notifications.v1.NotificationsService/MsgMessageCreate',
    requestStream: false,
    responseStream: false,
    requestType: notifications_pb.MsgMessageCreateRequest,
    responseType: notifications_pb.MsgMessageCreateResponse,
    requestSerialize: serialize_services_notifications_v1_MsgMessageCreateRequest,
    requestDeserialize: deserialize_services_notifications_v1_MsgMessageCreateRequest,
    responseSerialize: serialize_services_notifications_v1_MsgMessageCreateResponse,
    responseDeserialize: deserialize_services_notifications_v1_MsgMessageCreateResponse,
  },
  msgMessageUpdateStatus: {
    path: '/services.notifications.v1.NotificationsService/MsgMessageUpdateStatus',
    requestStream: false,
    responseStream: false,
    requestType: notifications_pb.MsgMessageUpdateStatusRequest,
    responseType: notifications_pb.MsgMessageUpdateStatusResponse,
    requestSerialize: serialize_services_notifications_v1_MsgMessageUpdateStatusRequest,
    requestDeserialize: deserialize_services_notifications_v1_MsgMessageUpdateStatusRequest,
    responseSerialize: serialize_services_notifications_v1_MsgMessageUpdateStatusResponse,
    responseDeserialize: deserialize_services_notifications_v1_MsgMessageUpdateStatusResponse,
  },
  msgMessagesList: {
    path: '/services.notifications.v1.NotificationsService/MsgMessagesList',
    requestStream: false,
    responseStream: false,
    requestType: notifications_pb.MsgMessagesListRequest,
    responseType: notifications_pb.MsgMessagesListResponse,
    requestSerialize: serialize_services_notifications_v1_MsgMessagesListRequest,
    requestDeserialize: deserialize_services_notifications_v1_MsgMessagesListRequest,
    responseSerialize: serialize_services_notifications_v1_MsgMessagesListResponse,
    responseDeserialize: deserialize_services_notifications_v1_MsgMessagesListResponse,
  },
  msgMessageHistoryList: {
    path: '/services.notifications.v1.NotificationsService/MsgMessageHistoryList',
    requestStream: false,
    responseStream: false,
    requestType: notifications_pb.MsgMessageHistoryListRequest,
    responseType: notifications_pb.MsgMessageHistoryListResponse,
    requestSerialize: serialize_services_notifications_v1_MsgMessageHistoryListRequest,
    requestDeserialize: deserialize_services_notifications_v1_MsgMessageHistoryListRequest,
    responseSerialize: serialize_services_notifications_v1_MsgMessageHistoryListResponse,
    responseDeserialize: deserialize_services_notifications_v1_MsgMessageHistoryListResponse,
  },
};

exports.NotificationsServiceClient = grpc.makeGenericClientConstructor(NotificationsServiceService, 'NotificationsService');
