import { WalletCurrency } from "@/domain/shared"
import {
  DisplayPriceRatio,
  InvalidZeroAmountPriceRatioInputError,
  PriceRatio,
  toDisplayPriceRatio,
  toWalletPriceRatio,
  usdPerBtcFromRatio,
  WalletPriceRatio,
} from "@/domain/payments"
import { UsdDisplayCurrency } from "@/domain/fiat"

describe("PriceRatio", () => {
  const otherQuoteAmount = 100n
  const btcQuoteAmount = {
    amount: 1000n,
    currency: WalletCurrency.Btc,
  }

  it("converts usd", () => {
    const convertAmount = 40n

    const priceRatio = PriceRatio({
      other: otherQuoteAmount,
      walletAmount: btcQuoteAmount,
    })
    if (priceRatio instanceof Error) throw priceRatio

    expect(priceRatio.convertFromOther(convertAmount)).toEqual({
      amount: 400n,
      currency: WalletCurrency.Btc,
    })
  })

  it("converts btc", () => {
    const convertAmount = {
      amount: 40n,
      currency: WalletCurrency.Btc,
    }

    const priceRatio = PriceRatio({
      other: otherQuoteAmount,
      walletAmount: btcQuoteAmount,
    })
    if (priceRatio instanceof Error) throw priceRatio

    expect(priceRatio.convertFromWallet(convertAmount)).toEqual(4n)
  })

  describe("rounds amounts", () => {
    describe("rounds amounts normally", () => {
      describe("converts from usd", () => {
        const btcPivot = { amount: 100_000_000n, currency: WalletCurrency.Btc }
        const quotient = 25n

        it("correctly rounds down when unrounded value is just below 0.5 less than target quotient", () => {
          const priceRatio = PriceRatio({
            other: 4_100_000n,
            walletAmount: btcPivot,
          })
          if (priceRatio instanceof Error) throw priceRatio

          expect(priceRatio.convertFromOther(1n)).toEqual({
            amount: quotient - 1n,
            currency: WalletCurrency.Btc,
          })
        })

        it("correctly rounds up when unrounded value is just above 0.5 more than target quotient", () => {
          const priceRatio = PriceRatio({
            other: 3_900_000n,
            walletAmount: btcPivot,
          })
          if (priceRatio instanceof Error) throw priceRatio

          expect(priceRatio.convertFromOther(1n)).toEqual({
            amount: quotient + 1n,
            currency: WalletCurrency.Btc,
          })
        })

        it("correctly rounds down when unrounded value is just above target quotient", () => {
          const priceRatio = PriceRatio({
            other: 3_999_900n,
            walletAmount: btcPivot,
          })
          if (priceRatio instanceof Error) throw priceRatio

          expect(priceRatio.convertFromOther(1n)).toEqual({
            amount: quotient,
            currency: WalletCurrency.Btc,
          })
        })

        it("correctly rounds up when unrounded value is just below target quotient", () => {
          const priceRatio = PriceRatio({
            other: 4_000_100n,
            walletAmount: btcPivot,
          })
          if (priceRatio instanceof Error) throw priceRatio

          expect(priceRatio.convertFromOther(1n)).toEqual({
            amount: quotient,
            currency: WalletCurrency.Btc,
          })
        })
      })
      describe("converts from btc", () => {
        const product = 2n
        const priceRatio = PriceRatio({
          other: 5_000_000n,
          walletAmount: { amount: 100_000_000n, currency: WalletCurrency.Btc },
        })
        if (priceRatio instanceof Error) throw priceRatio

        it("correctly rounds down when unrounded value is just below 0.5 less than target product", () => {
          const usdPaymentAmount = priceRatio.convertFromWallet({
            amount: 29n,
            currency: WalletCurrency.Btc,
          })
          expect(usdPaymentAmount).toEqual(product - 1n)
        })

        it("correctly rounds up when unrounded value is just above 0.5 more than target product", () => {
          const usdPaymentAmount = priceRatio.convertFromWallet({
            amount: 51n,
            currency: WalletCurrency.Btc,
          })
          expect(usdPaymentAmount).toEqual(product + 1n)
        })

        it("correctly rounds down when unrounded value is just above target product", () => {
          const usdPaymentAmount = priceRatio.convertFromWallet({
            amount: 41n,
            currency: WalletCurrency.Btc,
          })
          expect(usdPaymentAmount).toEqual(product)
        })

        it("correctly rounds up when unrounded value is just below target product", () => {
          const usdPaymentAmount = priceRatio.convertFromWallet({
            amount: 39n,
            currency: WalletCurrency.Btc,
          })
          expect(usdPaymentAmount).toEqual(product)
        })
      })
    })

    describe("rounds amounts to floor", () => {
      describe("converts from usd", () => {
        //TODO: implement
      })
      describe("converts from btc", () => {
        const product = 2n
        const priceRatio = PriceRatio({
          other: 5_000_000n,
          walletAmount: { amount: 100_000_000n, currency: WalletCurrency.Btc },
        })
        if (priceRatio instanceof Error) throw priceRatio

        it("correctly rounds down when unrounded value is just below 0.5 less than target product", () => {
          const usdPaymentAmount = priceRatio.convertFromWalletToFloor({
            amount: 29n,
            currency: WalletCurrency.Btc,
          })
          expect(usdPaymentAmount).toEqual(product - 1n)
        })

        it("correctly rounds down when unrounded value is just above 0.5 more than target product", () => {
          const usdPaymentAmount = priceRatio.convertFromWalletToFloor({
            amount: 51n,
            currency: WalletCurrency.Btc,
          })
          expect(usdPaymentAmount).toEqual(product)
        })

        it("correctly rounds down when unrounded value is just above target product", () => {
          const usdPaymentAmount = priceRatio.convertFromWalletToFloor({
            amount: 41n,
            currency: WalletCurrency.Btc,
          })
          expect(usdPaymentAmount).toEqual(product)
        })

        it("correctly rounds down when unrounded value is just below target product", () => {
          const usdPaymentAmount = priceRatio.convertFromWalletToFloor({
            amount: 39n,
            currency: WalletCurrency.Btc,
          })
          expect(usdPaymentAmount).toEqual(product - 1n)
        })
      })
    })

    describe("rounds amounts to ceil", () => {
      describe("converts from usd", () => {
        //TODO: implement
      })
      describe("converts from btc", () => {
        const product = 2n
        const priceRatio = PriceRatio({
          other: 5_000_000n,
          walletAmount: { amount: 100_000_000n, currency: WalletCurrency.Btc },
        })
        if (priceRatio instanceof Error) throw priceRatio

        it("correctly rounds up when unrounded value is just below 0.5 less than target product", () => {
          const usdPaymentAmount = priceRatio.convertFromWalletToCeil({
            amount: 29n,
            currency: WalletCurrency.Btc,
          })
          expect(usdPaymentAmount).toEqual(product)
        })

        it("correctly rounds up when unrounded value is just above 0.5 more than target product", () => {
          const usdPaymentAmount = priceRatio.convertFromWalletToCeil({
            amount: 51n,
            currency: WalletCurrency.Btc,
          })
          expect(usdPaymentAmount).toEqual(product + 1n)
        })

        it("correctly rounds up when unrounded value is just above target product", () => {
          const usdPaymentAmount = priceRatio.convertFromWalletToCeil({
            amount: 41n,
            currency: WalletCurrency.Btc,
          })
          expect(usdPaymentAmount).toEqual(product + 1n)
        })

        it("correctly rounds up when unrounded value is just below target product", () => {
          const usdPaymentAmount = priceRatio.convertFromWalletToCeil({
            amount: 39n,
            currency: WalletCurrency.Btc,
          })
          expect(usdPaymentAmount).toEqual(product)
        })
      })
    })
  })

  it("does not return zero usd amount for small ratios", () => {
    const convertAmount = {
      amount: 40n,
      currency: WalletCurrency.Btc,
    }

    const priceRatio = PriceRatio({
      other: 1n,
      walletAmount: { amount: 1000n, currency: WalletCurrency.Btc },
    })
    if (priceRatio instanceof Error) throw priceRatio

    expect(priceRatio.convertFromWallet(convertAmount)).toEqual(1n)
  })

  it("does not return zero btc amount for small ratios", () => {
    const convertAmount = 40n

    const priceRatio = PriceRatio({
      other: 1000n,
      walletAmount: { amount: 1n, currency: WalletCurrency.Btc },
    })
    if (priceRatio instanceof Error) throw priceRatio

    expect(priceRatio.convertFromOther(convertAmount)).toEqual({
      amount: 1n,
      currency: WalletCurrency.Btc,
    })
  })

  it("returns zero usd amount for zero btc conversion input", () => {
    const convertAmount = {
      amount: 0n,
      currency: WalletCurrency.Btc,
    }

    const priceRatio = PriceRatio({
      other: 1000n,
      walletAmount: { amount: 1n, currency: WalletCurrency.Btc },
    })
    if (priceRatio instanceof Error) throw priceRatio

    expect(priceRatio.convertFromWallet(convertAmount)).toEqual(0n)
  })

  it("returns zero btc amount for zero usd conversion input", () => {
    const convertAmount = 0n

    const priceRatio = PriceRatio({
      other: 1000n,
      walletAmount: { amount: 1n, currency: WalletCurrency.Btc },
    })
    if (priceRatio instanceof Error) throw priceRatio

    expect(priceRatio.convertFromOther(convertAmount)).toEqual({
      amount: 0n,
      currency: WalletCurrency.Btc,
    })
  })

  it("returns error for zero amount btc", () => {
    const priceRatio = PriceRatio({
      other: 1n,
      walletAmount: {
        amount: 0n,
        currency: WalletCurrency.Btc,
      },
    })
    expect(priceRatio).toBeInstanceOf(InvalidZeroAmountPriceRatioInputError)
  })

  it("returns error for zero amount usd", () => {
    const priceRatio = PriceRatio({
      other: 0n,
      walletAmount: {
        amount: 1n,
        currency: WalletCurrency.Btc,
      },
    })
    expect(priceRatio).toBeInstanceOf(InvalidZeroAmountPriceRatioInputError)
  })
})

describe("WalletPriceRatio", () => {
  const usdQuoteAmount = {
    amount: 100n,
    currency: WalletCurrency.Usd,
  }
  const btcQuoteAmount = {
    amount: 1000n,
    currency: WalletCurrency.Btc,
  }
  const walletPriceRatio = WalletPriceRatio({ usd: usdQuoteAmount, btc: btcQuoteAmount })
  if (walletPriceRatio instanceof Error) throw walletPriceRatio

  it("convertFromUsd", () => {
    const result = walletPriceRatio.convertFromUsd({
      amount: 40n,
      currency: WalletCurrency.Usd,
    })

    expect(result).toStrictEqual({
      amount: 400n,
      currency: WalletCurrency.Btc,
    })
  })

  it("convertFromBtc", () => {
    const result = walletPriceRatio.convertFromBtc({
      amount: 401n,
      currency: WalletCurrency.Btc,
    })

    expect(result).toStrictEqual({
      amount: 40n,
      currency: WalletCurrency.Usd,
    })
  })

  it("convertFromBtcToFloor", () => {
    const result = walletPriceRatio.convertFromBtcToFloor({
      amount: 401n,
      currency: WalletCurrency.Btc,
    })

    expect(result).toStrictEqual({
      amount: 40n,
      currency: WalletCurrency.Usd,
    })
  })

  it("convertFromBtcToCeil", () => {
    const result = walletPriceRatio.convertFromBtcToCeil({
      amount: 401n,
      currency: WalletCurrency.Btc,
    })

    expect(result).toStrictEqual({
      amount: 41n,
      currency: WalletCurrency.Usd,
    })
  })

  it("usdPerSat", () => expect(walletPriceRatio.usdPerSat()).toEqual(0.1))

  describe("convertFromUsdToFloor", () => {
    // $41,000/BTC
    const ratio = WalletPriceRatio({
      usd: { amount: 4_100_000n, currency: WalletCurrency.Usd },
      btc: { amount: 100_000_000n, currency: WalletCurrency.Btc },
    })
    if (ratio instanceof Error) throw ratio

    it("floors where convertFromUsd rounds", () => {
      const cents = { amount: 105n, currency: WalletCurrency.Usd }
      expect(ratio.convertFromUsd(cents)).toStrictEqual({
        amount: 2561n,
        currency: WalletCurrency.Btc,
      })
      expect(ratio.convertFromUsdToFloor(cents)).toStrictEqual({
        amount: 2560n,
        currency: WalletCurrency.Btc,
      })
    })

    it("has no 1-sat minimum", () => {
      // $41,000,000/BTC: one cent is 0.024 sats
      const steep = WalletPriceRatio({
        usd: { amount: 4_100_000_000n, currency: WalletCurrency.Usd },
        btc: { amount: 100_000_000n, currency: WalletCurrency.Btc },
      })
      if (steep instanceof Error) throw steep
      const cent = { amount: 1n, currency: WalletCurrency.Usd }
      expect(steep.convertFromUsd(cent).amount).toBe(1n)
      expect(steep.convertFromUsdToFloor(cent).amount).toBe(0n)
    })
  })
})

describe("usdPerBtcFromRatio", () => {
  it("derives USD per BTC from a cents-per-sat ratio", () => {
    const ratio = WalletPriceRatio({
      usd: { amount: 7_756_600n, currency: WalletCurrency.Usd },
      btc: { amount: 100_000_000n, currency: WalletCurrency.Btc },
    })
    if (ratio instanceof Error) throw ratio
    expect(usdPerBtcFromRatio(ratio)).toBeCloseTo(77_566, 6)

    const dealer = toWalletPriceRatio(0.077566)
    if (dealer instanceof Error) throw dealer
    expect(usdPerBtcFromRatio(dealer)).toBeCloseTo(77_566, 6)
  })
})

describe("DisplayPriceRatio", () => {
  const displayQuoteAmount = {
    amountInMinor: 100n,
    currency: UsdDisplayCurrency,
    displayInMajor: "1.00" as DisplayCurrencyMajorAmount,
  }
  const btcQuoteAmount = {
    amount: 1000n,
    currency: WalletCurrency.Btc,
  }
  const displayPriceRatio = DisplayPriceRatio({
    displayAmount: displayQuoteAmount,
    walletAmount: btcQuoteAmount,
  })
  if (displayPriceRatio instanceof Error) throw displayPriceRatio

  it("convertFromDisplayMinorUnit", () => {
    const result = displayPriceRatio.convertFromDisplayMinorUnit({
      amountInMinor: 40n,
      currency: UsdDisplayCurrency,
      displayInMajor: "0.40" as DisplayCurrencyMajorAmount,
    })

    expect(result).toStrictEqual({
      amount: 400n,
      currency: WalletCurrency.Btc,
    })
  })

  it("convertFromWallet", () => {
    const result = displayPriceRatio.convertFromWallet({
      amount: 401n,
      currency: WalletCurrency.Btc,
    })

    expect(result).toStrictEqual({
      amountInMinor: 40n,
      currency: UsdDisplayCurrency,
      displayInMajor: "0.40",
    })
  })

  it("convertFromWalletToFloor", () => {
    const result = displayPriceRatio.convertFromWalletToFloor({
      amount: 401n,
      currency: WalletCurrency.Btc,
    })

    expect(result).toStrictEqual({
      amountInMinor: 40n,
      currency: UsdDisplayCurrency,
      displayInMajor: "0.40",
    })
  })

  it("convertFromWalletToCeil", () => {
    const result = displayPriceRatio.convertFromWalletToCeil({
      amount: 401n,
      currency: WalletCurrency.Btc,
    })

    expect(result).toStrictEqual({
      amountInMinor: 41n,
      currency: UsdDisplayCurrency,
      displayInMajor: "0.41",
    })
  })

  it("displayMinorUnitPerWalletUnit", () =>
    expect(displayPriceRatio.displayMinorUnitPerWalletUnit()).toEqual(0.1))
})

describe("to WalletPriceRatio from float ratio", () => {
  it("converts a float ratio to WalletPriceRatio object", async () => {
    const ratio = 0.0005

    const priceRatio = toWalletPriceRatio(ratio)
    expect(priceRatio).not.toBeInstanceOf(Error)
    if (priceRatio instanceof Error) throw priceRatio

    expect(priceRatio.usdPerSat()).toEqual(ratio)
  })
})

describe("to DisplayPriceRatio from float ratio", () => {
  it("converts a float ratio to DisplayPriceRatio object", async () => {
    const ratio = 0.0005

    const priceRatio = toDisplayPriceRatio({
      ratio,
      displayCurrency: UsdDisplayCurrency,
    })
    expect(priceRatio).not.toBeInstanceOf(Error)
    if (priceRatio instanceof Error) throw priceRatio

    expect(priceRatio.displayMinorUnitPerWalletUnit()).toEqual(ratio)
  })
})
