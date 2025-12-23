# Blink API Contracts

## Overview

Blink exposes two primary GraphQL APIs and several internal gRPC services for service-to-service communication.

## Public GraphQL API

**Endpoint:** `/graphql`
**Schema:** `core/api/src/graphql/public/schema.graphql`
**Authentication:** JWT Bearer token (via Ory Kratos/Oathkeeper)

### Queries

| Query | Description | Auth Required |
|-------|-------------|---------------|
| `me` | Current user and account details | Yes |
| `globals` | Global app settings, network info, fees | No |
| `btcPriceList(range)` | Historical BTC price data | No |
| `currencyList` | Supported fiat currencies | No |
| `currencyConversionEstimation` | Convert amounts between currencies | No |
| `realtimePrice(currency)` | Current BTC/USD price | No |
| `lnInvoicePaymentStatusByHash` | Check invoice payment status | No |
| `lnInvoicePaymentStatusByPaymentRequest` | Check invoice by bolt11 | No |
| `onChainTxFee` | Estimate onchain tx fee (BTC) | Yes |
| `onChainUsdTxFee` | Estimate onchain tx fee (USD) | Yes |
| `accountDefaultWallet(username)` | Get user's default wallet | No |
| `usernameAvailable` | Check username availability | No |
| `businessMapMarkers` | Merchant map locations | No |

### Mutations - Authentication

| Mutation | Description |
|----------|-------------|
| `userLogin` | Login with phone + OTP |
| `userLoginUpgrade` | Upgrade session with phone verification |
| `userLoginUpgradeTelegram` | Upgrade via Telegram Passport |
| `userLogout` | Logout and invalidate token |
| `userPhoneRegistrationInitiate` | Start phone registration |
| `userPhoneRegistrationValidate` | Complete phone registration |
| `userEmailRegistrationInitiate` | Start email registration |
| `userEmailRegistrationValidate` | Complete email registration |
| `userTotpRegistrationInitiate` | Start 2FA setup |
| `userTotpRegistrationValidate` | Complete 2FA setup |
| `captchaCreateChallenge` | Get CAPTCHA challenge |
| `captchaRequestAuthCode` | Request auth code with CAPTCHA |

### Mutations - Account Management

| Mutation | Description |
|----------|-------------|
| `accountUpdateDefaultWalletId` | Set default wallet |
| `accountUpdateDisplayCurrency` | Set display currency |
| `accountEnableNotificationCategory` | Enable notification type |
| `accountDisableNotificationCategory` | Disable notification type |
| `accountDelete` | Delete account |
| `userUpdateLanguage` | Set preferred language |
| `userUpdateUsername` | Set username |
| `deviceNotificationTokenCreate` | Register push token |
| `callbackEndpointAdd` | Add webhook endpoint |
| `callbackEndpointDelete` | Remove webhook endpoint |

### Mutations - Lightning Payments

| Mutation | Description |
|----------|-------------|
| `lnInvoiceCreate` | Create BTC invoice with amount |
| `lnNoAmountInvoiceCreate` | Create BTC invoice without amount |
| `lnUsdInvoiceCreate` | Create USD invoice |
| `lnInvoicePaymentSend` | Pay lightning invoice |
| `lnNoAmountInvoicePaymentSend` | Pay invoice with amount |
| `lnNoAmountUsdInvoicePaymentSend` | Pay invoice in USD |
| `lnInvoiceFeeProbe` | Probe fee for invoice |
| `lnAddressPaymentSend` | Pay to lightning address |
| `lnurlPaymentSend` | Pay via LNURL |
| `lnInvoiceCancel` | Cancel unpaid invoice |

### Mutations - Onchain Payments

| Mutation | Description |
|----------|-------------|
| `onChainAddressCreate` | Generate new receive address |
| `onChainAddressCurrent` | Get current receive address |
| `onChainPaymentSend` | Send BTC onchain |
| `onChainPaymentSendAll` | Sweep wallet onchain |
| `onChainUsdPaymentSend` | Send USD value onchain |

### Mutations - Intraledger

| Mutation | Description |
|----------|-------------|
| `intraLedgerPaymentSend` | Send BTC to internal user |
| `intraLedgerUsdPaymentSend` | Send USD to internal user |

### Subscriptions

| Subscription | Description |
|--------------|-------------|
| `myUpdates` | Real-time account updates (payments, price) |
| `realtimePrice` | Live price feed |
| `lnInvoicePaymentStatusByHash` | Invoice payment updates |
| `lnInvoicePaymentStatusByPaymentRequest` | Invoice updates by bolt11 |

### Key Types

```graphql
# Wallet types
type BTCWallet implements Wallet { ... }
type UsdWallet implements Wallet { ... }

# Account
type ConsumerAccount implements Account { ... }

# Transactions
type Transaction {
  id: ID!
  direction: TxDirection!  # SEND | RECEIVE
  status: TxStatus!        # SUCCESS | PENDING | FAILURE
  initiationVia: InitiationVia!  # Ln | OnChain | IntraLedger
  settlementVia: SettlementVia!
  settlementAmount: SignedAmount!
  settlementCurrency: WalletCurrency!  # BTC | USD
  ...
}
```

---

## Admin GraphQL API

**Endpoint:** `/admin/graphql`
**Schema:** `core/api/src/graphql/admin/schema.graphql`
**Authentication:** Admin JWT with elevated privileges

### Queries

| Query | Description |
|-------|-------------|
| `accountDetailsByAccountId` | Get account by ID |
| `accountDetailsByUserId` | Get account by user ID |
| `accountDetailsByUserPhone` | Get account by phone |
| `accountDetailsByEmail` | Get account by email |
| `accountDetailsByUsername` | Get account by username |
| `wallet(walletId)` | Get wallet details |
| `transactionById` | Get transaction details |
| `transactionsByHash` | Find transactions by payment hash |
| `lightningInvoice(hash)` | Get LN invoice details |
| `lightningPayment(hash)` | Get LN payment details |
| `merchantsPendingApproval` | List merchants awaiting approval |
| `inactiveMerchants` | List inactive merchants |
| `filteredUserCount` | Count users by filter |
| `allLevels` | List account levels |

### Mutations

| Mutation | Description |
|----------|-------------|
| `accountUpdateLevel` | Change account level (0-3) |
| `accountUpdateStatus` | Change account status (ACTIVE, LOCKED, etc.) |
| `accountForceDelete` | Force delete account |
| `userUpdatePhone` | Admin update user phone |
| `userUpdateEmail` | Admin update user email |
| `merchantMapValidate` | Approve merchant listing |
| `merchantMapDelete` | Remove merchant listing |
| `marketingNotificationTrigger` | Send marketing push notification |

---

## Internal gRPC Services

### Price Service
**Proto:** `core/api/src/services/price/protos/price.proto`
- Real-time BTC/USD price feed
- Historical price queries

### Dealer Price Service
**Proto:** `core/api/src/services/dealer-price/proto/services/price/v1/price_service.proto`
- USD/BTC conversion quotes for trades

### Bria Service
**Proto:** `core/api/src/services/bria/proto/bria.proto`
- Onchain wallet operations
- UTXO management
- Fee estimation
- Transaction signing

### Notifications Service
**Proto:** `core/api/src/services/notifications/proto/notifications.proto`
- Push notification dispatch
- In-app notifications
- Email notifications

---

## Authentication Flow

1. **Phone Login:**
   - `captchaCreateChallenge` → Get CAPTCHA
   - `captchaRequestAuthCode` → Request OTP via SMS/WhatsApp
   - `userLogin` → Submit OTP, receive JWT

2. **Email Registration:**
   - `userEmailRegistrationInitiate` → Send verification email
   - `userEmailRegistrationValidate` → Submit code

3. **2FA (TOTP):**
   - `userTotpRegistrationInitiate` → Get TOTP secret
   - `userTotpRegistrationValidate` → Confirm with code

---

## Error Handling

All mutations return payloads with `errors: [Error!]!` array:

```graphql
interface Error {
  code: String
  message: String!
  path: [String]
}

type GraphQLApplicationError implements Error { ... }
```

Common error codes are returned in the `code` field for client-side handling and translation.

---

## Rate Limiting

- API endpoints are rate-limited per account
- Rate limits configured via Redis
- Velocity checks on withdrawals based on account level

---

## Webhook Callbacks

Accounts can register callback endpoints to receive real-time notifications:

```graphql
mutation {
  callbackEndpointAdd(input: { url: "https://example.com/webhook" }) {
    id
    errors { message }
  }
}
```

Callbacks are delivered via Svix for reliable webhook delivery.
