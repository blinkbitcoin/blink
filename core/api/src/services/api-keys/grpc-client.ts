import { promisify } from "util"

import { credentials, Metadata } from "@grpc/grpc-js"

import { ApiKeysServiceClient } from "./proto/api_keys_grpc_pb"

import {
  CheckAndLockSpendingRequest,
  CheckAndLockSpendingResponse,
  RecordSpendingRequest,
  RecordSpendingResponse,
  ReverseSpendingRequest,
  ReverseSpendingResponse,
} from "./proto/api_keys_pb"

import { API_KEYS_HOST, API_KEYS_PORT } from "@/config"

const apiKeysEndpoint = `${API_KEYS_HOST}:${API_KEYS_PORT}`

const apiKeysClient = new ApiKeysServiceClient(
  apiKeysEndpoint,
  credentials.createInsecure(),
)

export const apiKeysMetadata = new Metadata()

export const checkAndLockSpending = promisify<
  CheckAndLockSpendingRequest,
  Metadata,
  CheckAndLockSpendingResponse
>(apiKeysClient.checkAndLockSpending.bind(apiKeysClient))

export const recordSpending = promisify<
  RecordSpendingRequest,
  Metadata,
  RecordSpendingResponse
>(apiKeysClient.recordSpending.bind(apiKeysClient))

export const reverseSpending = promisify<
  ReverseSpendingRequest,
  Metadata,
  ReverseSpendingResponse
>(apiKeysClient.reverseSpending.bind(apiKeysClient))
