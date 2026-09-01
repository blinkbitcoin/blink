import crypto from "crypto"

import { Prices } from "@/app"

import { customPubSubTrigger, PubSubDefaultTriggers } from "@/domain/pubsub"
import {
  checkedToDisplayCurrency,
  MajorExponent,
  majorToMinorUnit,
  SAT_PRICE_PRECISION_OFFSET,
  UsdDisplayCurrency,
} from "@/domain/fiat"

import { GT } from "@/graphql/index"
import { UnknownClientError } from "@/graphql/error"
import PricePayload from "@/graphql/public/types/payload/price"
import SatAmount from "@/graphql/shared/types/scalar/sat-amount"
import ExchangeCurrencyUnit from "@/graphql/public/types/scalar/exchange-currency-unit"
import { PRICE_DEPRECATED_MESSAGE } from "@/graphql/public/root/subscription/deprecated-price"

import { PubSubService } from "@/services/pubsub"
import { baseLogger } from "@/services/logger"

const pubsub = PubSubService()

const PriceInput = GT.Input({
  name: "PriceInput",
  fields: () => ({
    amount: { type: GT.NonNull(SatAmount) },
    amountCurrencyUnit: { type: GT.NonNull(ExchangeCurrencyUnit) },
    priceCurrencyUnit: { type: GT.NonNull(ExchangeCurrencyUnit) },
  }),
})

type PriceSubscribeArgs = {
  input: {
    amount: number | Error
    amountCurrencyUnit: string | Error
    priceCurrencyUnit: string | Error
  }
}

type PriceResolveArgs = {
  input: {
    amount: number
    amountCurrencyUnit: string
    priceCurrencyUnit: string
  }
}

const PriceSubscription = {
  type: GT.NonNull(PricePayload),
  args: {
    input: { type: GT.NonNull(PriceInput) },
  },
  resolve: (
    source:
      | { errors?: IError[]; pricePerSat?: number; displayCurrency?: DisplayCurrency }
      | undefined,
    args: PriceResolveArgs,
  ) => {
    if (source === undefined) {
      throw new UnknownClientError({
        message:
          "Got 'undefined' payload. Check url used to ensure right websocket endpoint was used for subscription.",
        level: "fatal",
        logger: baseLogger,
      })
    }

    if (source.errors?.length) return { errors: source.errors }
    // Defense in depth: `subscribe` already rejects non-USD units before attaching the
    // recurring price trigger, so this should be unreachable for payloads we publish.
    if (source.displayCurrency !== UsdDisplayCurrency) {
      return {
        errors: [{ message: PRICE_DEPRECATED_MESSAGE }],
      }
    }
    if (!source.pricePerSat) {
      return { errors: [{ message: "No price info" }] }
    }

    // This deprecated subscription rejects non-USD payloads above, and its output
    // contract is explicitly denominated in USD cents.
    const minorUnitPerSat = majorToMinorUnit({
      amount: source.pricePerSat,
      fractionDigits: MajorExponent.STANDARD,
    })

    const amountPriceInCents = args.input.amount * minorUnitPerSat
    return {
      errors: [],
      price: {
        formattedAmount: amountPriceInCents.toString(),
        base: Math.round(amountPriceInCents * 10 ** SAT_PRICE_PRECISION_OFFSET),
        offset: SAT_PRICE_PRECISION_OFFSET,
        currencyUnit: `${source.displayCurrency}CENT`,
      },
    }
  },
  subscribe: async (_: unknown, args: PriceSubscribeArgs) => {
    const { amount, amountCurrencyUnit, priceCurrencyUnit } = args.input

    const immediateTrigger = customPubSubTrigger({
      event: PubSubDefaultTriggers.PriceUpdate,
      suffix: crypto.randomUUID(),
    })

    if (amount instanceof Error) {
      pubsub.publishDelayed({
        trigger: immediateTrigger,
        payload: { errors: [{ message: amount.message }] },
      })
      return pubsub.createAsyncIterator({ trigger: immediateTrigger })
    }

    for (const input of [amountCurrencyUnit, priceCurrencyUnit]) {
      if (input instanceof Error) {
        pubsub.publishDelayed({
          trigger: immediateTrigger,
          payload: { errors: [{ message: input.message }] },
        })
        return pubsub.createAsyncIterator({ trigger: immediateTrigger })
      }
    }

    const currencies = await Prices.listCurrencies()
    if (currencies instanceof Error) {
      pubsub.publishDelayed({
        trigger: immediateTrigger,
        payload: { errors: [{ message: currencies.message }] },
      })
      return pubsub.createAsyncIterator({ trigger: immediateTrigger })
    }

    const priceCurrency = currencies.find((c) => priceCurrencyUnit === `${c.code}CENT`)
    const displayCurrency = checkedToDisplayCurrency(priceCurrency?.code)

    if (amountCurrencyUnit !== "BTCSAT" || displayCurrency instanceof Error) {
      // For now, keep the only supported exchange price as SAT -> USD
      pubsub.publishDelayed({
        trigger: immediateTrigger,
        payload: { errors: [{ message: "Unsupported exchange unit" }] },
      })
    } else if (amount >= 1000000) {
      // SafeInt limit, reject for now
      pubsub.publishDelayed({
        trigger: immediateTrigger,
        payload: { errors: [{ message: "Unsupported exchange amount" }] },
      })
    } else if (displayCurrency !== UsdDisplayCurrency) {
      // This subscription is USD-only. Reject once here rather than attaching
      // `priceUpdateTrigger`, which publishes for every listed currency every 30s
      // (servers/trigger.ts) and would otherwise stream a deprecation error forever.
      pubsub.publishDelayed({
        trigger: immediateTrigger,
        payload: { errors: [{ message: PRICE_DEPRECATED_MESSAGE }] },
      })
    } else {
      const pricePerSat = await Prices.getCurrentSatPrice({ currency: displayCurrency })
      if (!(pricePerSat instanceof Error)) {
        pubsub.publishDelayed({
          trigger: immediateTrigger,
          payload: { pricePerSat: pricePerSat.price, displayCurrency },
        })
      }
      const priceUpdateTrigger = customPubSubTrigger({
        event: PubSubDefaultTriggers.PriceUpdate,
        suffix: displayCurrency,
      })
      return pubsub.createAsyncIterator({
        trigger: [immediateTrigger, priceUpdateTrigger],
      })
    }

    return pubsub.createAsyncIterator({ trigger: immediateTrigger })
  },
}

export default PriceSubscription
