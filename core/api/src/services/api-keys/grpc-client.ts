import { promisify } from "util"

import { credentials, Metadata } from "@grpc/grpc-js"

import { ApiKeysServiceClient } from "./proto/api_keys_grpc_pb"

import {
  CheckSpendingLimitRequest,
  CheckSpendingLimitResponse,
  GetSpendingSummaryRequest,
  GetSpendingSummaryResponse,
  RecordSpendingRequest,
  RecordSpendingResponse,
} from "./proto/api_keys_pb"

import { API_KEYS_HOST, API_KEYS_PORT } from "@/config"

const apiKeysEndpoint = `${API_KEYS_HOST}:${API_KEYS_PORT}`

const apiKeysClient = new ApiKeysServiceClient(
  apiKeysEndpoint,
  credentials.createInsecure(),
)

export const apiKeysMetadata = new Metadata()

export const checkSpendingLimit = promisify<
  CheckSpendingLimitRequest,
  Metadata,
  CheckSpendingLimitResponse
>(apiKeysClient.checkSpendingLimit.bind(apiKeysClient))

export const getSpendingSummary = promisify<
  GetSpendingSummaryRequest,
  Metadata,
  GetSpendingSummaryResponse
>(apiKeysClient.getSpendingSummary.bind(apiKeysClient))

export const recordSpending = promisify<
  RecordSpendingRequest,
  Metadata,
  RecordSpendingResponse
>(apiKeysClient.recordSpending.bind(apiKeysClient))
