import { listCachedPriceCurrencies } from "@/services/price/list-currencies"

export const listCurrencies = async (): Promise<PriceCurrency[] | ApplicationError> => {
  return listCachedPriceCurrencies()
}
