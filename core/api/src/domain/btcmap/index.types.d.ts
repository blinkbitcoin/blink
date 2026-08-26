type BtcMapCategory = string & { readonly brand: unique symbol }

type BtcMapPlaceName = string & { readonly brand: unique symbol }

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
