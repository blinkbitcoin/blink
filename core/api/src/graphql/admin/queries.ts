import AllLevelsQuery from "./root/query/all-levels"
import LightningInvoiceQuery from "./root/query/lightning-invoice"
import LightningPaymentQuery from "./root/query/lightning-payment"
import TransactionByIdQuery from "./root/query/transaction-by-id"
import TransactionsByHashQuery from "./root/query/transactions-by-hash"
import TransactionsByPaymentRequestQuery from "./root/query/transactions-by-payment-request"
import AccountDetailsByUserPhoneQuery from "./root/query/account-details-by-phone"
import AccountDetailsByUsernameQuery from "./root/query/account-details-by-username"
import AccountDetailsByUserEmailQuery from "./root/query/account-details-by-email"
import WalletQuery from "./root/query/wallet"
import AccountDetailsByAccountId from "./root/query/account-details-by-account-id"
import AccountDetailsByUserId from "./root/query/account-details-by-user-id"
import MerchantsPendingApprovalQuery from "./root/query/merchants-pending-approval-listing"
import InactiveMerchantsQuery from "./root/query/inactive-merchants-listing"
import FilteredUserCountQuery from "./root/query/filtered-user-count"

import { GT } from "@/graphql/index"

export const queryFields = {
  unauthed: {},
  authed: {
    accountDetailsByAccountId: AccountDetailsByAccountId,
    accountDetailsByEmail: AccountDetailsByUserEmailQuery,
    accountDetailsByUserPhone: AccountDetailsByUserPhoneQuery,
    accountDetailsByUserId: AccountDetailsByUserId,
    accountDetailsByUsername: AccountDetailsByUsernameQuery,
    allLevels: AllLevelsQuery,
    filteredUserCount: FilteredUserCountQuery,
    inactiveMerchants: InactiveMerchantsQuery,
    lightningInvoice: LightningInvoiceQuery,
    lightningPayment: LightningPaymentQuery,
    merchantsPendingApproval: MerchantsPendingApprovalQuery,
    transactionById: TransactionByIdQuery,
    transactionsByHash: TransactionsByHashQuery,
    transactionsByPaymentRequest: TransactionsByPaymentRequestQuery,
    wallet: WalletQuery,
  },
}

// Detailed query permissions mapping by access right
export const queryPermissions = {
  // Account viewing operations - require VIEW_ACCOUNTS
  viewAccounts: [
    "accountDetailsByAccountId",
    "accountDetailsByEmail",
    "accountDetailsByUserPhone",
    "accountDetailsByUserId",
    "accountDetailsByUsername",
    "filteredUserCount",
    "wallet",
    "inactiveMerchants",
    "merchantsPendingApproval",
  ] as (keyof typeof queryFields.authed)[],

  // Transaction viewing operations - require VIEW_TRANSACTIONS
  viewTransactions: [
    "lightningInvoice",
    "lightningPayment",
    "transactionById",
    "transactionsByHash",
    "transactionsByPaymentRequest",
  ] as (keyof typeof queryFields.authed)[],

  // System configuration operations - require SYSTEM_CONFIG
  systemConfig: ["allLevels"] as (keyof typeof queryFields.authed)[],
} as const

export const QueryType = GT.Object({
  name: "Query",
  fields: () => ({ ...queryFields.unauthed, ...queryFields.authed }),
})
