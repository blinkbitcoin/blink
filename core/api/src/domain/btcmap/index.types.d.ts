type BtcMapCategory = string & { readonly brand: unique symbol }

type BtcMapPlaceName = string & { readonly brand: unique symbol }

type BtcMapSubmissionId = string & { readonly brand: unique symbol }

type BtcMapPlaceSubmissionStatus = "pending" | "submitted"

type BtcMapPlaceSubmission = {
  accountId: AccountId
  submissionId: BtcMapSubmissionId
  externalId: string
  lat: number
  lon: number
  category: BtcMapCategory
  name: BtcMapPlaceName
  status: BtcMapPlaceSubmissionStatus
  btcMapPlaceId?: number
  createdAt: Date
  updatedAt: Date
}

type BtcMapServiceError = import("./errors").BtcMapServiceError

type BtcMapSubmitPlaceArgs = {
  externalId: string
  lat: number
  lon: number
  category: BtcMapCategory
  name: BtcMapPlaceName
  extraFields?: Record<string, unknown>
}

type BtcMapSubmitPlaceResult = {
  id: number
  origin: string
  external_id: string
}

interface IBtcMapService {
  submitPlace(
    args: BtcMapSubmitPlaceArgs,
  ): Promise<BtcMapSubmitPlaceResult | BtcMapServiceError>
}
