import { PriceService } from "./index"

import { SECS_PER_10_MINS } from "@/config"
import { CacheKeys } from "@/domain/cache"
import { LocalCacheService } from "@/services/cache/local-cache"

export const listCachedPriceCurrencies = async (): Promise<
  PriceCurrency[] | PriceServiceError
> => {
  return LocalCacheService().getOrSet({
    key: CacheKeys.PriceCurrencies,
    ttlSecs: SECS_PER_10_MINS,
    getForCaching: () => PriceService().listCurrencies(),
  })
}
