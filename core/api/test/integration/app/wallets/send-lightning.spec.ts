import { randomUUID } from "crypto"

import { Accounts, Payments } from "@/app"

import { AccountStatus } from "@/domain/accounts"
import { toSats } from "@/domain/bitcoin"
import {
  MaxFeeTooLargeForRoutelessPaymentError,
  PaymentSendStatus,
  decodeInvoice,
  TemporaryChannelFailureError,
  defaultTimeToExpiryInSeconds,
} from "@/domain/bitcoin/lightning"
import { UsdDisplayCurrency, toCents } from "@/domain/fiat"
import { LnPaymentRequestNonZeroAmountRequiredError } from "@/domain/payments"
import { LedgerTransactionType } from "@/domain/ledger"
import {
  InactiveAccountError,
  InsufficientBalanceError,
  IntraledgerLimitsExceededError,
  SelfPaymentError,
  TradeIntraAccountLimitsExceededError,
  WithdrawalLimitsExceededError,
  CouldNotFindLightningPaymentFlowError,
} from "@/domain/errors"
import { AmountCalculator, WalletCurrency } from "@/domain/shared"
import * as LnFeesImpl from "@/domain/payments"
import * as DisplayAmountsConverterImpl from "@/domain/fiat"
import * as ConfigImpl from "@/config"

import {
  AccountsRepository,
  LnPaymentsRepository,
  PaymentFlowStateRepository,
  WalletInvoicesRepository,
} from "@/services/mongoose"
import { LedgerService } from "@/services/ledger"
import { getBankOwnerWalletId } from "@/services/ledger/caching"
import { Transaction, TransactionMetadata } from "@/services/ledger/schema"
import { WalletInvoice } from "@/services/mongoose/schema"
import { LnPayment } from "@/services/lnd/schema"
import * as LndImpl from "@/services/lnd"
import * as LedgerFacadeImpl from "@/services/ledger/facade"

import {
  createMandatoryUsers,
  createRandomUserAndBtcWallet,
  createRandomUserAndWallets,
  getBalanceHelper,
  randomLedgerExternalId,
  recordReceiveLnPayment,
} from "test/helpers"

let lnInvoice: LnInvoice
let noAmountLnInvoice: LnInvoice
let largeWithAmountLnInvoice: LnInvoice
let memo: string

const calc = AmountCalculator()

const DEFAULT_PUBKEY =
  "03ca1907342d5d37744cb7038375e1867c24a87564c293157c95b2a9d38dcfb4c2" as Pubkey

beforeAll(async () => {
  await createMandatoryUsers()

  const randomRequest =
    "lnbcrt10n1p39jatkpp5djwv295kunhe5e0e4whj3dcjzwy7cmcxk8cl2a4dquyrp3dqydesdqqcqzpuxqr23ssp56u5m680x7resnvcelmsngc64ljm7g5q9r26zw0qyq5fenuqlcfzq9qyyssqxv4kvltas2qshhmqnjctnqkjpdfzu89e428ga6yk9jsp8rf382f3t03ex4e6x3a4sxkl7ruj6lsfpkuu9u9ee5kgr5zdyj7x2nwdljgq74025p"
  const invoice = decodeInvoice(randomRequest)
  if (invoice instanceof Error) throw invoice
  lnInvoice = invoice

  const randomNoAmountRequest =
    "lnbcrt1pjd9dmfpp5rf6q3rdstzcflshyux9dp05ft86xldx5s3ht99slsneneuefsjhsdqqcqzzsxqyz5vqsp5dl52mgulmljxlng5eafs7n3f54teg858dth67exxvk7wsgh62t6q9qyyssqjqekrkdga0uqnd0fv5dzhuky0l2wnmzr4q846x7grtw75zejla68pjh7vww2y6qvhx576yfexj8x24my72vj2y5929w5lju0f6fpnegp08kdm0"
  const noAmountInvoice = decodeInvoice(randomNoAmountRequest)
  if (noAmountInvoice instanceof Error) throw noAmountInvoice
  noAmountLnInvoice = noAmountInvoice

  const largeWithAmountRequest =
    "lnbcrt31pjdlc2mpp54seydar5l4pz20aq4ngmdp8ghx4s63476yrpy0a04l534g5u3ueqdqqcqzzsxqyz5vqsp5v45qm8fzn5r7hw7qcku0a92qrmfrsycqjwahue3vetyx9cljgeks9qyyssqzdpd0pq7m9qpy5v7r50yswmx57y7uh2q4czrz7cesxhz0rg52y8h6vp2e7jy9vsffxqjxtu82y58smj48f427up8kmlxql4m3r8pn8cq8yhwzl"
  const largeWithAmountInvoice = decodeInvoice(largeWithAmountRequest)
  if (largeWithAmountInvoice instanceof Error) throw largeWithAmountInvoice
  largeWithAmountLnInvoice = largeWithAmountInvoice
})

beforeEach(async () => {
  memo = randomLightningMemo()
  await LnPayment.deleteMany({})
})

afterEach(async () => {
  await Transaction.deleteMany({})
  await TransactionMetadata.deleteMany({})
  await WalletInvoice.deleteMany({})
  await LnPayment.deleteMany({})

  jest.restoreAllMocks()
})

const amount = toSats(10040)
const btcPaymentAmount: BtcPaymentAmount = {
  amount: BigInt(amount),
  currency: WalletCurrency.Btc,
}

const usdAmount = toCents(210)
const usdPaymentAmount: UsdPaymentAmount = {
  amount: BigInt(usdAmount),
  currency: WalletCurrency.Usd,
}

const receiveAmounts = { btc: calc.mul(btcPaymentAmount, 3n), usd: usdPaymentAmount }

const receiveBankFee = {
  btc: { amount: 100n, currency: WalletCurrency.Btc },
  usd: { amount: 1n, currency: WalletCurrency.Usd },
}

const receiveDisplayAmounts = {
  amountDisplayCurrency: Number(receiveAmounts.usd.amount) as DisplayCurrencyBaseAmount,
  feeDisplayCurrency: Number(receiveBankFee.usd.amount) as DisplayCurrencyBaseAmount,
  displayCurrency: UsdDisplayCurrency,
}

const receiveAboveLimitAmounts = {
  btc: { amount: 300_000_000n, currency: WalletCurrency.Btc },
  usd: { amount: 6_000_000n, currency: WalletCurrency.Usd },
}
const receiveAboveLimitDisplayAmounts = {
  amountDisplayCurrency: Number(
    receiveAboveLimitAmounts.usd.amount,
  ) as DisplayCurrencyBaseAmount,
  feeDisplayCurrency: Number(receiveBankFee.usd.amount) as DisplayCurrencyBaseAmount,
  displayCurrency: UsdDisplayCurrency,
}

const updatedByPrivilegedClientId = randomUUID() as PrivilegedClientId

const randomLightningMemo = () =>
  "this is my lightning memo #" + (Math.random() * 1_000_000).toFixed()

describe("initiated via lightning", () => {
  describe("fee probe", () => {
    it("fails if amount greater than limit", async () => {
      // Create users
      const newWalletDescriptor = await createRandomUserAndBtcWallet()
      const newAccount = await AccountsRepository().findById(
        newWalletDescriptor.accountId,
      )
      if (newAccount instanceof Error) throw newAccount

      // Fund balance for send
      for (let i = 0; i < 2; i++) {
        const receive = await recordReceiveLnPayment({
          walletDescriptor: newWalletDescriptor,
          paymentAmount: receiveAboveLimitAmounts,
          bankFee: receiveBankFee,
          displayAmounts: receiveAboveLimitDisplayAmounts,
          memo,
        })
        if (receive instanceof Error) throw receive
      }

      // Execute probe
      const { error } = await Payments.getNoAmountLightningFeeEstimationForBtcWallet({
        walletId: newWalletDescriptor.id,
        uncheckedPaymentRequest: noAmountLnInvoice.paymentRequest,

        amount: toSats(receiveAboveLimitAmounts.btc.amount),
      })
      expect(error).toBeInstanceOf(WithdrawalLimitsExceededError)
    })
  })

  describe("settles via lightning", () => {
    it("fails if sender account is locked", async () => {
      // Setup mocks
      const { LndService: LnServiceOrig } = jest.requireActual("@/services/lnd")
      const lndServiceSpy = jest.spyOn(LndImpl, "LndService").mockReturnValue({
        ...LnServiceOrig(),
        listAllPubkeys: () => [],
      })

      // Create users
      const newWalletDescriptor = await createRandomUserAndBtcWallet()
      const newAccount = await AccountsRepository().findById(
        newWalletDescriptor.accountId,
      )
      if (newAccount instanceof Error) throw newAccount

      // Fund balance for send
      const receive = await recordReceiveLnPayment({
        walletDescriptor: newWalletDescriptor,
        paymentAmount: receiveAmounts,
        bankFee: receiveBankFee,
        displayAmounts: receiveDisplayAmounts,
        memo,
      })
      if (receive instanceof Error) throw receive

      // Lock sender account
      const updatedAccount = await Accounts.updateAccountStatus({
        accountId: newAccount.id,
        status: AccountStatus.Locked,
        updatedByPrivilegedClientId,
      })
      if (updatedAccount instanceof Error) throw updatedAccount
      expect(updatedAccount.status).toEqual(AccountStatus.Locked)

      // Attempt send payment
      const res = await Payments.payInvoiceByWalletId({
        senderWalletId: newWalletDescriptor.id,
        senderAccount: newAccount,
        uncheckedPaymentRequest: lnInvoice.paymentRequest,

        memo,
      })
      expect(res).toBeInstanceOf(InactiveAccountError)

      // Restore system state
      lndServiceSpy.mockRestore()
    })

    it("fails when user has insufficient balance", async () => {
      // Setup mocks
      const { LndService: LnServiceOrig } = jest.requireActual("@/services/lnd")
      const lndServiceSpy = jest.spyOn(LndImpl, "LndService").mockReturnValue({
        ...LnServiceOrig(),
        listAllPubkeys: () => [],
      })

      // Create users
      const newWalletDescriptor = await createRandomUserAndBtcWallet()
      const newAccount = await AccountsRepository().findById(
        newWalletDescriptor.accountId,
      )
      if (newAccount instanceof Error) throw newAccount

      // Attempt pay
      const paymentResult = await Payments.payInvoiceByWalletId({
        uncheckedPaymentRequest: lnInvoice.paymentRequest,
        memo,
        senderWalletId: newWalletDescriptor.id,
        senderAccount: newAccount,
      })
      expect(paymentResult).toBeInstanceOf(InsufficientBalanceError)

      // Restore system state
      lndServiceSpy.mockRestore()
    })

    it("fails to pay zero amount invoice without separate amount", async () => {
      // Setup mocks
      const { LndService: LnServiceOrig } = jest.requireActual("@/services/lnd")
      const lndServiceSpy = jest.spyOn(LndImpl, "LndService").mockReturnValue({
        ...LnServiceOrig(),
        listAllPubkeys: () => [],
      })

      // Create users
      const newWalletDescriptor = await createRandomUserAndBtcWallet()
      const newAccount = await AccountsRepository().findById(
        newWalletDescriptor.accountId,
      )
      if (newAccount instanceof Error) throw newAccount

      // Attempt pay
      const paymentResult = await Payments.payInvoiceByWalletId({
        uncheckedPaymentRequest: noAmountLnInvoice.paymentRequest,
        memo,
        senderWalletId: newWalletDescriptor.id,
        senderAccount: newAccount,
      })
      expect(paymentResult).toBeInstanceOf(LnPaymentRequestNonZeroAmountRequiredError)

      // Restore system state
      lndServiceSpy.mockRestore()
    })

    it("fails if user sends balance amount without accounting for fee", async () => {
      // Setup mocks
      const { LndService: LnServiceOrig } = jest.requireActual("@/services/lnd")
      const lndServiceSpy = jest.spyOn(LndImpl, "LndService").mockReturnValue({
        ...LnServiceOrig(),
        listAllPubkeys: () => [],
      })

      // Create users
      const newWalletDescriptor = await createRandomUserAndBtcWallet()
      const newAccount = await AccountsRepository().findById(
        newWalletDescriptor.accountId,
      )
      if (newAccount instanceof Error) throw newAccount

      // Fund balance for send
      const receive = await recordReceiveLnPayment({
        walletDescriptor: newWalletDescriptor,
        paymentAmount: receiveAmounts,
        bankFee: receiveBankFee,
        displayAmounts: receiveDisplayAmounts,
        memo,
      })
      if (receive instanceof Error) throw receive

      // Attempt pay
      const balance = await getBalanceHelper(newWalletDescriptor.id)
      const paymentResult = await Payments.payNoAmountInvoiceByWalletIdForBtcWallet({
        uncheckedPaymentRequest: noAmountLnInvoice.paymentRequest,
        memo,
        senderWalletId: newWalletDescriptor.id,
        senderAccount: newAccount,
        amount: balance,
      })
      expect(paymentResult).toBeInstanceOf(InsufficientBalanceError)

      // Restore system state
      lndServiceSpy.mockRestore()
    })

    it("fails if amount greater than limit", async () => {
      // Create users
      const newWalletDescriptor = await createRandomUserAndBtcWallet()
      const newAccount = await AccountsRepository().findById(
        newWalletDescriptor.accountId,
      )
      if (newAccount instanceof Error) throw newAccount

      // Fund balance for send
      for (let i = 0; i < 2; i++) {
        const receive = await recordReceiveLnPayment({
          walletDescriptor: newWalletDescriptor,
          paymentAmount: receiveAboveLimitAmounts,
          bankFee: receiveBankFee,
          displayAmounts: receiveAboveLimitDisplayAmounts,
          memo,
        })
        if (receive instanceof Error) throw receive
      }

      // Attempt pay with invoice with amount
      const paymentResult = await Payments.payInvoiceByWalletId({
        uncheckedPaymentRequest: largeWithAmountLnInvoice.paymentRequest,
        memo,
        senderWalletId: newWalletDescriptor.id,
        senderAccount: newAccount,
      })
      expect(paymentResult).toBeInstanceOf(WithdrawalLimitsExceededError)

      // Attempt pay with no amount invoice
      const noAmountPaymentResult =
        await Payments.payNoAmountInvoiceByWalletIdForBtcWallet({
          uncheckedPaymentRequest: noAmountLnInvoice.paymentRequest,
          memo,
          senderWalletId: newWalletDescriptor.id,
          senderAccount: newAccount,

          amount: toSats(receiveAboveLimitAmounts.btc.amount),
        })
      expect(noAmountPaymentResult).toBeInstanceOf(WithdrawalLimitsExceededError)
    })

    it("pay zero amount invoice & revert txn when verifyMaxFee fails", async () => {
      // Setup mocks
      const { LndService: LnServiceOrig } = jest.requireActual("@/services/lnd")
      const lndServiceSpy = jest.spyOn(LndImpl, "LndService").mockReturnValue({
        ...LnServiceOrig(),
        listAllPubkeys: () => [],
        defaultPubkey: (): Pubkey => DEFAULT_PUBKEY,
      })

      const { LnFees: LnFeesOrig } = jest.requireActual("@/domain/payments")
      const lndFeesSpy = jest.spyOn(LnFeesImpl, "LnFees").mockReturnValue({
        ...LnFeesOrig(),
        verifyMaxFee: () => new MaxFeeTooLargeForRoutelessPaymentError(),
      })

      // Create users
      const newWalletDescriptor = await createRandomUserAndBtcWallet()
      const newAccount = await AccountsRepository().findById(
        newWalletDescriptor.accountId,
      )
      if (newAccount instanceof Error) throw newAccount

      // Fund balance for send
      const receive = await recordReceiveLnPayment({
        walletDescriptor: newWalletDescriptor,
        paymentAmount: receiveAmounts,
        bankFee: receiveBankFee,
        displayAmounts: receiveDisplayAmounts,
        memo,
      })
      if (receive instanceof Error) throw receive

      // Attempt pay
      const paymentResult = await Payments.payInvoiceByWalletId({
        uncheckedPaymentRequest: lnInvoice.paymentRequest,
        memo,
        senderWalletId: newWalletDescriptor.id,
        senderAccount: newAccount,
      })
      expect(paymentResult).toBeInstanceOf(MaxFeeTooLargeForRoutelessPaymentError)

      // Expect transaction to be canceled
      const txns = await LedgerService().getTransactionsByHash(lnInvoice.paymentHash)
      if (txns instanceof Error) throw txns

      const { satsAmount, satsFee } = txns[0]
      expect(txns.length).toEqual(2)
      expect(txns).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            lnMemo: "Payment canceled",
            credit: (satsAmount || 0) + (satsFee || 0),
            debit: 0,
            pendingConfirmation: false,
          }),
          expect.objectContaining({
            lnMemo: memo,
            debit: (satsAmount || 0) + (satsFee || 0),
            credit: 0,
            pendingConfirmation: false,
          }),
        ]),
      )

      // Restore system state
      lndFeesSpy.mockRestore()
      lndServiceSpy.mockRestore()
    })

    it("persists ln-payment on successful ln send", async () => {
      // Setup mocks
      const { LndService: LnServiceOrig } = jest.requireActual("@/services/lnd")
      const lndServiceSpy = jest.spyOn(LndImpl, "LndService").mockReturnValue({
        ...LnServiceOrig(),
        defaultPubkey: (): Pubkey => DEFAULT_PUBKEY,
        listAllPubkeys: () => [],
        payInvoiceViaPaymentDetails: () => ({
          roundedUpFee: toSats(0),
          revealedPreImage: "revealedPreImage" as RevealedPreImage,
          sentFromPubkey: DEFAULT_PUBKEY,
        }),
      })

      // Create users
      const newWalletDescriptor = await createRandomUserAndBtcWallet()
      const newAccount = await AccountsRepository().findById(
        newWalletDescriptor.accountId,
      )
      if (newAccount instanceof Error) throw newAccount

      // Fund balance for send
      const receive = await recordReceiveLnPayment({
        walletDescriptor: newWalletDescriptor,
        paymentAmount: receiveAmounts,
        bankFee: receiveBankFee,
        displayAmounts: receiveDisplayAmounts,
        memo,
      })
      if (receive instanceof Error) throw receive

      // Execute pay
      const paymentResult = await Payments.payNoAmountInvoiceByWalletIdForBtcWallet({
        uncheckedPaymentRequest: noAmountLnInvoice.paymentRequest,
        memo,
        senderWalletId: newWalletDescriptor.id,
        senderAccount: newAccount,
        amount,
      })
      if (paymentResult instanceof Error) throw paymentResult
      expect(paymentResult).toEqual({
        status: PaymentSendStatus.Success,
        transaction: expect.objectContaining({
          walletId: newWalletDescriptor.id,
          status: "success",
          settlementAmount: (amount + paymentResult.transaction.settlementFee) * -1,
          settlementCurrency: "BTC",
          initiationVia: expect.objectContaining({
            type: "lightning",
            paymentHash: noAmountLnInvoice.paymentHash,
            pubkey: DEFAULT_PUBKEY,
          }),
          settlementVia: expect.objectContaining({
            type: "lightning",
          }),
        }),
      })

      // Check lnPayment collection after
      const lnPaymentAfter = await LnPaymentsRepository().findByPaymentHash(
        noAmountLnInvoice.paymentHash,
      )
      if (lnPaymentAfter instanceof Error) throw lnPaymentAfter
      expect(lnPaymentAfter.paymentHash).toEqual(noAmountLnInvoice.paymentHash)

      // Restore system state
      lndServiceSpy.mockRestore()
    })

    it("records transaction with lightning metadata on ln send", async () => {
      // Setup mocks
      const { LndService: LnServiceOrig } = jest.requireActual("@/services/lnd")
      jest.spyOn(LndImpl, "LndService").mockReturnValue({
        ...LnServiceOrig(),
        defaultPubkey: (): Pubkey => DEFAULT_PUBKEY,
        listAllPubkeys: () => [],
      })

      const displayAmountsConverterSpy = jest.spyOn(
        DisplayAmountsConverterImpl,
        "DisplayAmountsConverter",
      )

      const lnSendLedgerMetadataSpy = jest.spyOn(LedgerFacadeImpl, "LnSendLedgerMetadata")
      const recordOffChainSendSpy = jest.spyOn(LedgerFacadeImpl, "recordSendOffChain")

      // Create users
      const newWalletDescriptor = await createRandomUserAndBtcWallet()
      const newAccount = await AccountsRepository().findById(
        newWalletDescriptor.accountId,
      )
      if (newAccount instanceof Error) throw newAccount

      // Fund balance for send
      const receive = await recordReceiveLnPayment({
        walletDescriptor: newWalletDescriptor,
        paymentAmount: receiveAmounts,
        bankFee: receiveBankFee,
        displayAmounts: receiveDisplayAmounts,
        memo,
      })
      if (receive instanceof Error) throw receive

      // Execute pay
      await Payments.payNoAmountInvoiceByWalletIdForBtcWallet({
        uncheckedPaymentRequest: noAmountLnInvoice.paymentRequest,
        memo,
        senderWalletId: newWalletDescriptor.id,
        senderAccount: newAccount,
        amount,
      })

      // Check record function was called with right metadata
      expect(displayAmountsConverterSpy).toHaveBeenCalledTimes(1)
      expect(lnSendLedgerMetadataSpy).toHaveBeenCalledTimes(1)
      const args = recordOffChainSendSpy.mock.calls[0][0]
      expect(args.metadata.type).toBe(LedgerTransactionType.Payment)
    })

    it("records transaction with fee reimbursement metadata on ln send", async () => {
      // Setup mocks
      const { LndService: LnServiceOrig } = jest.requireActual("@/services/lnd")
      jest.spyOn(LndImpl, "LndService").mockReturnValue({
        ...LnServiceOrig(),
        defaultPubkey: (): Pubkey => DEFAULT_PUBKEY,
        listAllPubkeys: () => [],
        payInvoiceViaPaymentDetails: () => ({
          roundedUpFee: toSats(0),
          revealedPreImage: "revealedPreImage" as RevealedPreImage,
          sentFromPubkey: DEFAULT_PUBKEY,
        }),
      })

      const displayAmountsConverterSpy = jest.spyOn(
        DisplayAmountsConverterImpl,
        "DisplayAmountsConverter",
      )

      const lnFeeReimbursementReceiveLedgerMetadataSpy = jest.spyOn(
        LedgerFacadeImpl,
        "LnFeeReimbursementReceiveLedgerMetadata",
      )
      const recordOffChainReceiveSpy = jest.spyOn(
        LedgerFacadeImpl,
        "recordReceiveOffChain",
      )

      // Create users
      const newWalletDescriptor = await createRandomUserAndBtcWallet()
      const newAccount = await AccountsRepository().findById(
        newWalletDescriptor.accountId,
      )
      if (newAccount instanceof Error) throw newAccount

      // Fund balance for send
      const receive = await recordReceiveLnPayment({
        walletDescriptor: newWalletDescriptor,
        paymentAmount: receiveAmounts,
        bankFee: receiveBankFee,
        displayAmounts: receiveDisplayAmounts,
        memo,
      })
      if (receive instanceof Error) throw receive

      // Execute pay
      await Payments.payNoAmountInvoiceByWalletIdForBtcWallet({
        uncheckedPaymentRequest: noAmountLnInvoice.paymentRequest,
        memo,
        senderWalletId: newWalletDescriptor.id,
        senderAccount: newAccount,
        amount,
      })

      // Check record function was called with right metadata
      expect(displayAmountsConverterSpy).toHaveBeenCalledTimes(2)
      expect(lnFeeReimbursementReceiveLedgerMetadataSpy).toHaveBeenCalledTimes(1)
      // Note: 1st call is funding balance in test, 2nd call is fee reimbursement
      const args = recordOffChainReceiveSpy.mock.calls[1][0]
      expect(args.metadata.type).toBe(LedgerTransactionType.LnFeeReimbursement)
    })

    it("delete payment flow when lightning service returns TemporaryChannelFailureError", async () => {
      // Setup mocks
      const { LndService: LnServiceOrig } = jest.requireActual("@/services/lnd")
      const lndServiceSpy = jest.spyOn(LndImpl, "LndService").mockReturnValue({
        ...LnServiceOrig(),
        defaultPubkey: (): Pubkey => DEFAULT_PUBKEY,
        listAllPubkeys: () => [],
        payInvoiceViaRoutes: () => new TemporaryChannelFailureError(),
      })

      // Create users
      const newWalletDescriptor = await createRandomUserAndBtcWallet()
      const newAccount = await AccountsRepository().findById(
        newWalletDescriptor.accountId,
      )
      if (newAccount instanceof Error) throw newAccount

      // Fund balance for send
      const receive = await recordReceiveLnPayment({
        walletDescriptor: newWalletDescriptor,
        paymentAmount: receiveAmounts,
        bankFee: receiveBankFee,
        displayAmounts: receiveDisplayAmounts,
        memo,
      })
      if (receive instanceof Error) throw receive

      // Execute probe
      const { error } = await Payments.getNoAmountLightningFeeEstimationForBtcWallet({
        walletId: newWalletDescriptor.id,
        uncheckedPaymentRequest: noAmountLnInvoice.paymentRequest,
        amount,
      })
      expect(error).toBeUndefined()

      let paymentFlow = await PaymentFlowStateRepository(
        defaultTimeToExpiryInSeconds,
      ).findLightningPaymentFlow({
        walletId: newWalletDescriptor.id,
        paymentHash: noAmountLnInvoice.paymentHash,
        inputAmount: btcPaymentAmount.amount,
      })
      expect(paymentFlow).not.toBeInstanceOf(Error)

      // Execute pay
      const paymentResult = await Payments.payNoAmountInvoiceByWalletIdForBtcWallet({
        uncheckedPaymentRequest: noAmountLnInvoice.paymentRequest,
        memo,
        senderWalletId: newWalletDescriptor.id,
        senderAccount: newAccount,
        amount,
      })
      expect(paymentResult).toBeInstanceOf(TemporaryChannelFailureError)

      paymentFlow = await PaymentFlowStateRepository(
        defaultTimeToExpiryInSeconds,
      ).findLightningPaymentFlow({
        walletId: newWalletDescriptor.id,
        paymentHash: noAmountLnInvoice.paymentHash,
        inputAmount: btcPaymentAmount.amount,
      })
      expect(paymentFlow).toBeInstanceOf(CouldNotFindLightningPaymentFlowError)

      // Restore system state
      lndServiceSpy.mockRestore()
    })
  })

  describe("settles intraledger", () => {
    it("fails if recipient account is locked", async () => {
      const { paymentHash, destination } = lnInvoice

      // Setup mocks
      const { LndService: LnServiceOrig } = jest.requireActual("@/services/lnd")
      const lndServiceSpy = jest.spyOn(LndImpl, "LndService").mockReturnValue({
        ...LnServiceOrig(),
        listAllPubkeys: () => [destination],
      })

      // Setup users and wallets
      const newWalletDescriptor = await createRandomUserAndBtcWallet()
      const newAccount = await AccountsRepository().findById(
        newWalletDescriptor.accountId,
      )
      if (newAccount instanceof Error) throw newAccount

      const recipientWalletDescriptor = await createRandomUserAndBtcWallet()
      const recipientAccount = await AccountsRepository().findById(
        recipientWalletDescriptor.accountId,
      )
      if (recipientAccount instanceof Error) throw recipientAccount

      // Fund balance for send
      const receive = await recordReceiveLnPayment({
        walletDescriptor: newWalletDescriptor,
        paymentAmount: receiveAmounts,
        bankFee: receiveBankFee,
        displayAmounts: receiveDisplayAmounts,
        memo,
      })
      if (receive instanceof Error) throw receive

      const externalId = randomLedgerExternalId()
      if (externalId instanceof Error) throw externalId

      // Add recipient invoice
      const persisted = await WalletInvoicesRepository().persistNew({
        paymentHash,
        secret: "secret" as SecretPreImage,
        selfGenerated: true,
        pubkey: destination,
        recipientWalletDescriptor,
        paid: false,
        lnInvoice,
        processingCompleted: false,
        externalId,
      })
      if (persisted instanceof Error) throw persisted

      // Lock recipient account
      const updatedAccount = await Accounts.updateAccountStatus({
        accountId: recipientAccount.id,
        status: AccountStatus.Locked,
        updatedByPrivilegedClientId,
      })
      if (updatedAccount instanceof Error) throw updatedAccount
      expect(updatedAccount.status).toEqual(AccountStatus.Locked)

      // Attempt send payment
      const res = await Payments.payInvoiceByWalletId({
        senderWalletId: newWalletDescriptor.id,
        senderAccount: newAccount,
        uncheckedPaymentRequest: lnInvoice.paymentRequest,

        memo,
      })
      expect(res).toBeInstanceOf(InactiveAccountError)

      // Restore system state
      lndServiceSpy.mockRestore()
    })

    it("fails if sends to self", async () => {
      // Setup mocks
      const { LndService: LnServiceOrig } = jest.requireActual("@/services/lnd")
      const lndServiceSpy = jest.spyOn(LndImpl, "LndService").mockReturnValue({
        ...LnServiceOrig(),
        listAllPubkeys: () => [lnInvoice.destination],
      })

      // Create users
      const newWalletDescriptor = await createRandomUserAndBtcWallet()
      const newAccount = await AccountsRepository().findById(
        newWalletDescriptor.accountId,
      )
      if (newAccount instanceof Error) throw newAccount

      const externalId = randomLedgerExternalId()
      if (externalId instanceof Error) throw externalId

      // Persist invoice as self-invoice
      const persisted = await WalletInvoicesRepository().persistNew({
        paymentHash: lnInvoice.paymentHash,
        secret: "secret" as SecretPreImage,
        selfGenerated: true,
        pubkey: lnInvoice.destination,
        recipientWalletDescriptor: newWalletDescriptor,
        paid: false,
        lnInvoice,
        processingCompleted: false,
        externalId,
      })
      if (persisted instanceof Error) throw persisted

      // Fund balance for send
      const receive = await recordReceiveLnPayment({
        walletDescriptor: newWalletDescriptor,
        paymentAmount: receiveAmounts,
        bankFee: receiveBankFee,
        displayAmounts: receiveDisplayAmounts,
        memo,
      })
      if (receive instanceof Error) throw receive

      // Attempt pay
      const paymentResult = await Payments.payInvoiceByWalletId({
        uncheckedPaymentRequest: lnInvoice.paymentRequest,
        memo,
        senderWalletId: newWalletDescriptor.id,
        senderAccount: newAccount,
      })
      expect(paymentResult).toBeInstanceOf(SelfPaymentError)

      // Restore system state
      lndServiceSpy.mockRestore()
    })

    it("fails if amount greater than trade-intra-account limit", async () => {
      // Setup mocks
      const { LndService: LnServiceOrig } = jest.requireActual("@/services/lnd")
      const lndServiceSpy = jest.spyOn(LndImpl, "LndService").mockReturnValue({
        ...LnServiceOrig(),
        listAllPubkeys: () => [
          noAmountLnInvoice.destination,
          largeWithAmountLnInvoice.destination,
        ],
      })

      // Create users
      const { btcWalletDescriptor: newWalletDescriptor, usdWalletDescriptor } =
        await createRandomUserAndWallets()
      const newAccount = await AccountsRepository().findById(
        newWalletDescriptor.accountId,
      )
      if (newAccount instanceof Error) throw newAccount

      // Fund balance for send
      for (let i = 0; i < 2; i++) {
        const receive = await recordReceiveLnPayment({
          walletDescriptor: newWalletDescriptor,
          paymentAmount: receiveAboveLimitAmounts,
          bankFee: receiveBankFee,
          displayAmounts: receiveAboveLimitDisplayAmounts,
          memo,
        })
        if (receive instanceof Error) throw receive
      }

      expect(largeWithAmountLnInvoice.paymentAmount).toStrictEqual(
        receiveAboveLimitAmounts.btc,
      )
      const usdAmount = receiveAboveLimitAmounts.usd

      let externalId = randomLedgerExternalId()
      if (externalId instanceof Error) throw externalId

      // Persist invoice as self-invoice
      const persisted = await WalletInvoicesRepository().persistNew({
        paymentHash: largeWithAmountLnInvoice.paymentHash,
        secret: "secret" as SecretPreImage,
        selfGenerated: true,
        pubkey: largeWithAmountLnInvoice.destination,
        recipientWalletDescriptor: usdWalletDescriptor,
        paid: false,
        usdAmount,
        lnInvoice,
        processingCompleted: false,
        externalId,
      })
      if (persisted instanceof Error) throw persisted

      // Attempt pay with invoice with amount
      const paymentResult = await Payments.payInvoiceByWalletId({
        uncheckedPaymentRequest: largeWithAmountLnInvoice.paymentRequest,
        memo,
        senderWalletId: newWalletDescriptor.id,
        senderAccount: newAccount,
      })
      expect(paymentResult).toBeInstanceOf(TradeIntraAccountLimitsExceededError)

      externalId = randomLedgerExternalId()
      if (externalId instanceof Error) throw externalId

      // Persist no-amount invoice as self-invoice
      const noAmountPersisted = await WalletInvoicesRepository().persistNew({
        paymentHash: noAmountLnInvoice.paymentHash,
        secret: "secret" as SecretPreImage,
        selfGenerated: true,
        pubkey: noAmountLnInvoice.destination,
        recipientWalletDescriptor: usdWalletDescriptor,
        paid: false,
        lnInvoice,
        processingCompleted: false,
        externalId,
      })
      if (noAmountPersisted instanceof Error) throw noAmountPersisted

      // Attempt pay with no-amount invoice
      const noAmountPaymentResult =
        await Payments.payNoAmountInvoiceByWalletIdForBtcWallet({
          uncheckedPaymentRequest: noAmountLnInvoice.paymentRequest,
          memo,
          senderWalletId: newWalletDescriptor.id,
          senderAccount: newAccount,

          amount: toSats(receiveAboveLimitAmounts.btc.amount),
        })
      expect(noAmountPaymentResult).toBeInstanceOf(TradeIntraAccountLimitsExceededError)

      // Restore system state
      lndServiceSpy.mockReset()
    })

    it("fails if amount greater than intraledger limit", async () => {
      // Setup mocks
      const { LndService: LnServiceOrig } = jest.requireActual("@/services/lnd")
      const lndServiceSpy = jest.spyOn(LndImpl, "LndService").mockReturnValue({
        ...LnServiceOrig(),
        listAllPubkeys: () => [
          noAmountLnInvoice.destination,
          largeWithAmountLnInvoice.destination,
        ],
      })

      // Create users
      const newWalletDescriptor = await createRandomUserAndBtcWallet()
      const otherWalletDescriptor = await createRandomUserAndBtcWallet()
      const newAccount = await AccountsRepository().findById(
        newWalletDescriptor.accountId,
      )
      if (newAccount instanceof Error) throw newAccount

      // Fund balance for send
      for (let i = 0; i < 2; i++) {
        const receive = await recordReceiveLnPayment({
          walletDescriptor: newWalletDescriptor,
          paymentAmount: receiveAboveLimitAmounts,
          bankFee: receiveBankFee,
          displayAmounts: receiveAboveLimitDisplayAmounts,
          memo,
        })
        if (receive instanceof Error) throw receive
      }

      let externalId = randomLedgerExternalId()
      if (externalId instanceof Error) throw externalId

      // Persist invoice as self-invoice
      const persisted = await WalletInvoicesRepository().persistNew({
        paymentHash: largeWithAmountLnInvoice.paymentHash,
        secret: "secret" as SecretPreImage,
        selfGenerated: true,
        pubkey: largeWithAmountLnInvoice.destination,
        recipientWalletDescriptor: otherWalletDescriptor,
        paid: false,
        lnInvoice,
        processingCompleted: false,
        externalId,
      })
      if (persisted instanceof Error) throw persisted

      // Attempt pay with invoice with amount
      const paymentResult = await Payments.payInvoiceByWalletId({
        uncheckedPaymentRequest: largeWithAmountLnInvoice.paymentRequest,
        memo,
        senderWalletId: newWalletDescriptor.id,
        senderAccount: newAccount,
      })
      expect(paymentResult).toBeInstanceOf(IntraledgerLimitsExceededError)

      externalId = randomLedgerExternalId()
      if (externalId instanceof Error) throw externalId

      // Persist no-amount invoice as self-invoice
      const noAmountPersisted = await WalletInvoicesRepository().persistNew({
        paymentHash: noAmountLnInvoice.paymentHash,
        secret: "secret" as SecretPreImage,
        selfGenerated: true,
        pubkey: noAmountLnInvoice.destination,
        recipientWalletDescriptor: otherWalletDescriptor,
        paid: false,
        lnInvoice,
        processingCompleted: false,
        externalId,
      })
      if (noAmountPersisted instanceof Error) throw noAmountPersisted

      // Attempt pay with no-amount invoice
      const noAmountPaymentResult =
        await Payments.payNoAmountInvoiceByWalletIdForBtcWallet({
          uncheckedPaymentRequest: noAmountLnInvoice.paymentRequest,
          memo,
          senderWalletId: newWalletDescriptor.id,
          senderAccount: newAccount,

          amount: toSats(receiveAboveLimitAmounts.btc.amount),
        })
      expect(noAmountPaymentResult).toBeInstanceOf(IntraledgerLimitsExceededError)

      // Restore system state
      lndServiceSpy.mockReset()
    })

    it("records transaction with ln-trade-intra-account metadata on intraledger send", async () => {
      // Setup mocks
      const { LndService: LnServiceOrig } = jest.requireActual("@/services/lnd")
      jest.spyOn(LndImpl, "LndService").mockReturnValue({
        ...LnServiceOrig(),
        listAllPubkeys: () => [noAmountLnInvoice.destination],
        cancelInvoice: () => true,
      })

      const displayAmountsConverterSpy = jest.spyOn(
        DisplayAmountsConverterImpl,
        "DisplayAmountsConverter",
      )

      const lnTradeIntraAccountLedgerMetadataSpy = jest.spyOn(
        LedgerFacadeImpl,
        "LnTradeIntraAccountLedgerMetadata",
      )
      const recordIntraledgerSpy = jest.spyOn(LedgerFacadeImpl, "recordIntraledger")

      // Create users
      const { btcWalletDescriptor: newWalletDescriptor, usdWalletDescriptor } =
        await createRandomUserAndWallets()
      const newAccount = await AccountsRepository().findById(
        newWalletDescriptor.accountId,
      )
      if (newAccount instanceof Error) throw newAccount

      const externalId = randomLedgerExternalId()
      if (externalId instanceof Error) throw externalId

      // Persist invoice as self-invoice
      const persisted = await WalletInvoicesRepository().persistNew({
        paymentHash: noAmountLnInvoice.paymentHash,
        secret: "secret" as SecretPreImage,
        selfGenerated: true,
        pubkey: noAmountLnInvoice.destination,
        recipientWalletDescriptor: usdWalletDescriptor,
        paid: false,
        lnInvoice,
        processingCompleted: false,
        externalId,
      })
      if (persisted instanceof Error) throw persisted

      // Fund balance for send
      const receive = await recordReceiveLnPayment({
        walletDescriptor: newWalletDescriptor,
        paymentAmount: receiveAmounts,
        bankFee: receiveBankFee,
        displayAmounts: receiveDisplayAmounts,
        memo,
      })
      if (receive instanceof Error) throw receive

      // Execute pay
      await Payments.payNoAmountInvoiceByWalletIdForBtcWallet({
        uncheckedPaymentRequest: noAmountLnInvoice.paymentRequest,
        memo,
        senderWalletId: newWalletDescriptor.id,
        senderAccount: newAccount,
        amount,
      })

      // Check record function was called with right metadata
      expect(displayAmountsConverterSpy).toHaveBeenCalledTimes(2)
      expect(lnTradeIntraAccountLedgerMetadataSpy).toHaveBeenCalledTimes(1)
      const args = recordIntraledgerSpy.mock.calls[0][0]
      expect(args.metadata.type).toBe(LedgerTransactionType.LnTradeIntraAccount)
    })

    it("records transaction with ln-intraledger metadata on intraledger send", async () => {
      // Setup mocks
      const { LndService: LnServiceOrig } = jest.requireActual("@/services/lnd")
      jest.spyOn(LndImpl, "LndService").mockReturnValue({
        ...LnServiceOrig(),
        listAllPubkeys: () => [noAmountLnInvoice.destination],
        cancelInvoice: () => true,
      })

      const displayAmountsConverterSpy = jest.spyOn(
        DisplayAmountsConverterImpl,
        "DisplayAmountsConverter",
      )

      const lnIntraledgerLedgerMetadataSpy = jest.spyOn(
        LedgerFacadeImpl,
        "LnIntraledgerLedgerMetadata",
      )
      const recordIntraledgerSpy = jest.spyOn(LedgerFacadeImpl, "recordIntraledger")

      // Setup users and wallets
      const newWalletDescriptor = await createRandomUserAndBtcWallet()
      const newAccount = await AccountsRepository().findById(
        newWalletDescriptor.accountId,
      )
      if (newAccount instanceof Error) throw newAccount

      const recipientWalletDescriptor = await createRandomUserAndBtcWallet()

      const externalId = randomLedgerExternalId()
      if (externalId instanceof Error) throw externalId

      // Persist invoice as self-invoice
      const persisted = await WalletInvoicesRepository().persistNew({
        paymentHash: noAmountLnInvoice.paymentHash,
        secret: "secret" as SecretPreImage,
        selfGenerated: true,
        pubkey: noAmountLnInvoice.destination,
        recipientWalletDescriptor,
        paid: false,
        lnInvoice,
        processingCompleted: false,
        externalId,
      })
      if (persisted instanceof Error) throw persisted

      // Fund balance for send
      const receive = await recordReceiveLnPayment({
        walletDescriptor: newWalletDescriptor,
        paymentAmount: receiveAmounts,
        bankFee: receiveBankFee,
        displayAmounts: receiveDisplayAmounts,
        memo,
      })
      if (receive instanceof Error) throw receive

      // Execute pay
      await Payments.payNoAmountInvoiceByWalletIdForBtcWallet({
        uncheckedPaymentRequest: noAmountLnInvoice.paymentRequest,
        memo,
        senderWalletId: newWalletDescriptor.id,
        senderAccount: newAccount,
        amount,
      })

      // Check record function was called with right metadata
      expect(displayAmountsConverterSpy).toHaveBeenCalledTimes(2)
      expect(lnIntraledgerLedgerMetadataSpy).toHaveBeenCalledTimes(1)
      const args = recordIntraledgerSpy.mock.calls[0][0]
      expect(args.metadata.type).toBe(LedgerTransactionType.LnIntraLedger)
    })
  })

  // T2 #07 — 0.3% Lightning service fee on external sends above $100.
  // NOTE: these tests require live mongo / LND / price-server and are not
  // runnable in a bare sandbox. The exact-$100.00 boundary is covered
  // deterministically by the strategy unit test; here we cover ≤ $100.
  describe("service fee on external sends (#07)", () => {
    // > $100 at the dev price-server rate (~$2.10 per 10_040 sats)
    const aboveThresholdSats = toSats(1_000_000)
    const expectedServiceFeeSats = Number(
      calc.mulBasisPoints(
        { amount: BigInt(aboveThresholdSats), currency: WalletCurrency.Btc },
        30n,
      ).amount,
    )

    const fundingReceiveAmounts = {
      btc: { amount: 2_000_000n, currency: WalletCurrency.Btc } as BtcPaymentAmount,
      usd: { amount: 42_000n, currency: WalletCurrency.Usd } as UsdPaymentAmount,
    }
    const fundingDisplayAmounts = {
      amountDisplayCurrency: Number(
        fundingReceiveAmounts.usd.amount,
      ) as DisplayCurrencyBaseAmount,
      feeDisplayCurrency: Number(receiveBankFee.usd.amount) as DisplayCurrencyBaseAmount,
      displayCurrency: UsdDisplayCurrency,
    }

    const enableServiceFeeGate = () => {
      const { getLightningNetworkConfig } = jest.requireActual("@/config")
      const actual = getLightningNetworkConfig()
      jest.spyOn(ConfigImpl, "getLightningNetworkConfig").mockReturnValue({
        ...actual,
        send: {
          ...actual.send,
          feeStrategies: [
            {
              name: "lightning_service_fee",
              strategy: "percentageAboveThreshold",
              params: { basisPoints: 30, thresholdInCents: 10_000 },
            },
          ],
        },
      })
    }

    const mockLndSuccess = (rawRoute?: RawRoute) => {
      const { LndService: LnServiceOrig } = jest.requireActual("@/services/lnd")
      jest.spyOn(LndImpl, "LndService").mockReturnValue({
        ...LnServiceOrig(),
        defaultPubkey: (): Pubkey => DEFAULT_PUBKEY,
        listAllPubkeys: () => [],
        findRouteForInvoice: () =>
          rawRoute
            ? { rawRoute, pubkey: DEFAULT_PUBKEY }
            : new TemporaryChannelFailureError(),
        findRouteForNoAmountInvoice: () =>
          rawRoute
            ? { rawRoute, pubkey: DEFAULT_PUBKEY }
            : new TemporaryChannelFailureError(),
        payInvoiceViaPaymentDetails: () => ({
          roundedUpFee: toSats(0),
          revealedPreImage: "revealedPreImage" as RevealedPreImage,
          sentFromPubkey: DEFAULT_PUBKEY,
        }),
        payInvoiceViaRoutes: () => ({
          roundedUpFee: toSats(0),
          revealedPreImage: "revealedPreImage" as RevealedPreImage,
          sentFromPubkey: DEFAULT_PUBKEY,
        }),
      })
    }

    // Net sats credited to the bank-owner (service-fee revenue) for a hash.
    // Returns 0 if no revenue leg was written (or it was reverted).
    const bankOwnerServiceFeeFor = async (paymentHash: PaymentHash): Promise<number> => {
      const bankOwnerWalletId = await getBankOwnerWalletId()
      const txns = await LedgerService().getTransactionsByHash(paymentHash)
      if (txns instanceof Error) throw txns
      const bankTxns = txns.filter((t) => t.walletId === bankOwnerWalletId)
      const credit = bankTxns.reduce((sum, t) => sum + (Number(t.credit) || 0), 0)
      const debit = bankTxns.reduce((sum, t) => sum + (Number(t.debit) || 0), 0)
      return credit - debit
    }

    const fundedBtcWallet = async () => {
      const walletDescriptor = await createRandomUserAndBtcWallet()
      const account = await AccountsRepository().findById(walletDescriptor.accountId)
      if (account instanceof Error) throw account

      const receive = await recordReceiveLnPayment({
        walletDescriptor,
        paymentAmount: fundingReceiveAmounts,
        bankFee: receiveBankFee,
        displayAmounts: fundingDisplayAmounts,
        memo,
      })
      if (receive instanceof Error) throw receive

      return { walletDescriptor, account }
    }

    it("credits bank-owner the 0.3% service fee on an external BTC send above $100", async () => {
      enableServiceFeeGate()
      mockLndSuccess()

      const { walletDescriptor, account } = await fundedBtcWallet()

      const paymentResult = await Payments.payNoAmountInvoiceByWalletIdForBtcWallet({
        uncheckedPaymentRequest: noAmountLnInvoice.paymentRequest,
        memo,
        senderWalletId: walletDescriptor.id,
        senderAccount: account,
        amount: aboveThresholdSats,
      })
      if (paymentResult instanceof Error) throw paymentResult
      expect(paymentResult.status).toEqual(PaymentSendStatus.Success)

      // Bank-owner is credited exactly the service fee, distinct from the
      // routing reserve leg (which lands in Assets:Reserve:Lightning).
      const serviceFee = await bankOwnerServiceFeeFor(noAmountLnInvoice.paymentHash)
      expect(serviceFee).toEqual(expectedServiceFeeSats)

      // Model 2: the sender debit (satsFee) is the accounting TOTAL (routing
      // reserve + service fee); the service-fee breakdown is self-identified by
      // the bank-owner credit leg (asserted above), so the total is strictly
      // greater than the service fee (reserve > 0).
      const txns = await LedgerService().getTransactionsByHash(
        noAmountLnInvoice.paymentHash,
      )
      if (txns instanceof Error) throw txns
      const senderTxn = txns.find((t) => t.walletId === walletDescriptor.id)
      if (senderTxn === undefined) throw new Error("Expected sender txn not found")
      expect(Number(senderTxn.satsFee)).toBeGreaterThan(expectedServiceFeeSats)
    })

    it("charges no service fee for a send at or below $100", async () => {
      enableServiceFeeGate()
      mockLndSuccess()

      const { walletDescriptor, account } = await fundedBtcWallet()

      // `amount` (10_040 sats ≈ $2.10) is well below the $100 gate.
      const paymentResult = await Payments.payNoAmountInvoiceByWalletIdForBtcWallet({
        uncheckedPaymentRequest: noAmountLnInvoice.paymentRequest,
        memo,
        senderWalletId: walletDescriptor.id,
        senderAccount: account,
        amount,
      })
      if (paymentResult instanceof Error) throw paymentResult
      expect(paymentResult.status).toEqual(PaymentSendStatus.Success)

      const serviceFee = await bankOwnerServiceFeeFor(noAmountLnInvoice.paymentHash)
      expect(serviceFee).toEqual(0)
    })

    it("charges no service fee when the rollout gate is off (default config)", async () => {
      // Do NOT enable the gate — default lightning.send.feeStrategies = [zero_fee]
      mockLndSuccess()

      const { walletDescriptor, account } = await fundedBtcWallet()

      const paymentResult = await Payments.payNoAmountInvoiceByWalletIdForBtcWallet({
        uncheckedPaymentRequest: noAmountLnInvoice.paymentRequest,
        memo,
        senderWalletId: walletDescriptor.id,
        senderAccount: account,
        amount: aboveThresholdSats,
      })
      if (paymentResult instanceof Error) throw paymentResult
      expect(paymentResult.status).toEqual(PaymentSendStatus.Success)

      const serviceFee = await bankOwnerServiceFeeFor(noAmountLnInvoice.paymentHash)
      expect(serviceFee).toEqual(0)
    })

    it("still applies the service fee on a probed send above $100", async () => {
      const rawRoute = { total_mtokens: "21000000", safe_fee: 210 } as RawRoute

      enableServiceFeeGate()
      mockLndSuccess(rawRoute)

      const { walletDescriptor, account } = await fundedBtcWallet()

      // Probe first — persists the flow (with the service fee in btcBankFee)
      // via withRoute, so the send loads it from the repository.
      const probe = await Payments.getNoAmountLightningFeeEstimationForBtcWallet({
        walletId: walletDescriptor.id,
        uncheckedPaymentRequest: noAmountLnInvoice.paymentRequest,
        amount: aboveThresholdSats,
      })
      expect(probe).not.toBeInstanceOf(Error)

      const paymentResult = await Payments.payNoAmountInvoiceByWalletIdForBtcWallet({
        uncheckedPaymentRequest: noAmountLnInvoice.paymentRequest,
        memo,
        senderWalletId: walletDescriptor.id,
        senderAccount: account,
        amount: aboveThresholdSats,
      })
      if (paymentResult instanceof Error) throw paymentResult
      expect(paymentResult.status).toEqual(PaymentSendStatus.Success)

      // The service fee survives probing and is recognized on top of the
      // actual routing fee.
      const serviceFee = await bankOwnerServiceFeeFor(noAmountLnInvoice.paymentHash)
      expect(serviceFee).toEqual(expectedServiceFeeSats)
    })

    it("recognizes no revenue when the send fails (reverted journal)", async () => {
      enableServiceFeeGate()

      const { LndService: LnServiceOrig } = jest.requireActual("@/services/lnd")
      jest.spyOn(LndImpl, "LndService").mockReturnValue({
        ...LnServiceOrig(),
        defaultPubkey: (): Pubkey => DEFAULT_PUBKEY,
        listAllPubkeys: () => [],
        payInvoiceViaPaymentDetails: () => new TemporaryChannelFailureError(),
      })

      const { walletDescriptor, account } = await fundedBtcWallet()

      const paymentResult = await Payments.payNoAmountInvoiceByWalletIdForBtcWallet({
        uncheckedPaymentRequest: noAmountLnInvoice.paymentRequest,
        memo,
        senderWalletId: walletDescriptor.id,
        senderAccount: account,
        amount: aboveThresholdSats,
      })
      expect(paymentResult).toBeInstanceOf(TemporaryChannelFailureError)

      // The pending journal (including the bank-owner credit) is voided —
      // no orphan revenue.
      const serviceFee = await bankOwnerServiceFeeFor(noAmountLnInvoice.paymentHash)
      expect(serviceFee).toEqual(0)
    })

    it("charges the service fee on a USD-wallet external send above $100 (threshold compared in USD)", async () => {
      enableServiceFeeGate()
      mockLndSuccess()

      const { usdWalletDescriptor } = await createRandomUserAndWallets()
      const account = await AccountsRepository().findById(usdWalletDescriptor.accountId)
      if (account instanceof Error) throw account

      const receive = await recordReceiveLnPayment({
        walletDescriptor: usdWalletDescriptor,
        paymentAmount: fundingReceiveAmounts,
        bankFee: receiveBankFee,
        displayAmounts: fundingDisplayAmounts,
        memo,
      })
      if (receive instanceof Error) throw receive

      const paymentResult = await Payments.payNoAmountInvoiceByWalletIdForUsdWallet({
        uncheckedPaymentRequest: noAmountLnInvoice.paymentRequest,
        memo,
        senderWalletId: usdWalletDescriptor.id,
        senderAccount: account,
        amount: toCents(20_000), // $200.00, above the $100 gate
      })
      if (paymentResult instanceof Error) throw paymentResult
      expect(paymentResult.status).toEqual(PaymentSendStatus.Success)

      const serviceFee = await bankOwnerServiceFeeFor(noAmountLnInvoice.paymentHash)
      expect(serviceFee).toBeGreaterThan(0)
    })

    it("on a non-probed send that settles, reimburses the unused reserve only and retains the service fee (finding B)", async () => {
      // Non-probed path: findRouteForInvoice fails → payInvoiceViaPaymentDetails
      // returns roundedUpFee 0, so the actual routing fee (0) is below the 0.5%
      // reserve and reimburseFee runs on the synchronous settle path.
      enableServiceFeeGate()
      mockLndSuccess()

      const { walletDescriptor, account } = await fundedBtcWallet()

      const paymentResult = await Payments.payNoAmountInvoiceByWalletIdForBtcWallet({
        uncheckedPaymentRequest: noAmountLnInvoice.paymentRequest,
        memo,
        senderWalletId: walletDescriptor.id,
        senderAccount: account,
        amount: aboveThresholdSats,
      })
      if (paymentResult instanceof Error) throw paymentResult
      expect(paymentResult.status).toEqual(PaymentSendStatus.Success)

      const txns = await LedgerService().getTransactionsByHash(
        noAmountLnInvoice.paymentHash,
      )
      if (txns instanceof Error) throw txns

      // Original send leg: satsFee = accounting TOTAL (reserve + service). The
      // service-fee breakdown is recovered from the self-identifying bank-owner
      // credit leg (mirrors on-chain), not from a metadata field.
      const senderSend = txns.find(
        (t) =>
          t.walletId === walletDescriptor.id && t.type === LedgerTransactionType.Payment,
      )
      if (senderSend === undefined) throw new Error("Expected sender send txn not found")
      const total = Number(senderSend.satsFee)
      const service = await bankOwnerServiceFeeFor(noAmountLnInvoice.paymentHash)
      expect(service).toEqual(expectedServiceFeeSats)

      // The reimbursement credits the sender the unused reserve ONLY
      // (reserve − actual, actual = 0) = total − service, NOT the full total —
      // the 0.3% service fee is never refunded.
      const reimbursement = txns
        .filter(
          (t) =>
            t.walletId === walletDescriptor.id &&
            t.type === LedgerTransactionType.LnFeeReimbursement,
        )
        .reduce((sum, t) => sum + (Number(t.credit) || 0), 0)
      expect(reimbursement).toEqual(total - service)
      expect(reimbursement).not.toEqual(total)

      // The service fee is retained as bank-owner revenue.
      const serviceFeeRevenue = await bankOwnerServiceFeeFor(
        noAmountLnInvoice.paymentHash,
      )
      expect(serviceFeeRevenue).toEqual(expectedServiceFeeSats)
    })
  })
})
