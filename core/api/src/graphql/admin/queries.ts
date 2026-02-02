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

import { accessRules, extractFields, buildPermissionMappings } from "./access-rules"

import { GT } from "@/graphql/index"

// Query fields with embedded access rules
export const queryFields = {
  unauthed: {},
  authed: {
    accountDetailsByAccountId: {
      field: AccountDetailsByAccountId,
      rule: accessRules.viewAccounts,
    },
    accountDetailsByEmail: {
      field: AccountDetailsByUserEmailQuery,
      rule: accessRules.viewAccounts,
    },
    accountDetailsByUserPhone: {
      field: AccountDetailsByUserPhoneQuery,
      rule: accessRules.viewAccounts,
    },
    accountDetailsByUserId: {
      field: AccountDetailsByUserId,
      rule: accessRules.viewAccounts,
    },
    accountDetailsByUsername: {
      field: AccountDetailsByUsernameQuery,
      rule: accessRules.viewAccounts,
    },
    filteredUserCount: {
      field: FilteredUserCountQuery,
      rule: accessRules.viewAccounts,
    },
    wallet: {
      field: WalletQuery,
      rule: accessRules.viewAccounts,
    },
    inactiveMerchants: {
      field: InactiveMerchantsQuery,
      rule: accessRules.viewMerchants,
    },
    merchantsPendingApproval: {
      field: MerchantsPendingApprovalQuery,
      rule: accessRules.viewMerchants,
    },

    lightningInvoice: {
      field: LightningInvoiceQuery,
      rule: accessRules.viewTransactions,
    },
    lightningPayment: {
      field: LightningPaymentQuery,
      rule: accessRules.viewTransactions,
    },
    transactionById: {
      field: TransactionByIdQuery,
      rule: accessRules.viewTransactions,
    },
    transactionsByHash: {
      field: TransactionsByHashQuery,
      rule: accessRules.viewTransactions,
    },
    transactionsByPaymentRequest: {
      field: TransactionsByPaymentRequestQuery,
      rule: accessRules.viewTransactions,
    },

    allLevels: {
      field: AllLevelsQuery,
      rule: accessRules.systemConfig,
    },
  },
}

const extractedQueryFields = extractFields(queryFields.authed)

export const queryPermissions = buildPermissionMappings(queryFields.authed)

export const QueryType = GT.Object({
  name: "Query",
  fields: () => ({ ...queryFields.unauthed, ...extractedQueryFields }),
})
