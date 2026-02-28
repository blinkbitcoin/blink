# Blink Data Models

## Overview

Blink uses a polyglot persistence architecture:
- **MongoDB**: Primary datastore for accounts, wallets, transactions (core/api)
- **PostgreSQL**: API keys (api-keys service), notifications (notifications service)
- **Redis**: Caching, distributed locks, rate limiting, pub/sub

---

## MongoDB Collections (core/api)

### Account
**Collection:** `accounts`
**Schema:** `core/api/src/services/mongoose/schema.ts`

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `kratosUserId` | String | Ory Kratos identity ID |
| `username` | String | Unique username (3-50 chars, alphanumeric + underscore) |
| `level` | Number (0-3) | Account verification level |
| `role` | Enum | `user`, `dealer`, `bankowner`, `funder` |
| `statusHistory` | Array | Status changes with timestamps |
| `defaultWalletId` | UUID | Default wallet for payments |
| `displayCurrency` | String | Preferred fiat currency |
| `withdrawFee` | Number | Custom withdrawal fee (optional) |
| `contactEnabled` | Boolean | Allow contact requests |
| `created_at` | Date | Account creation timestamp |

**Indexes:**
- `id` (unique)
- `kratosUserId` (unique, sparse)
- `username` (unique, case-insensitive, sparse)

### User
**Collection:** `users`

| Field | Type | Description |
|-------|------|-------------|
| `userId` | String | Kratos user ID reference |
| `phone` | String | Phone number (E.164 format) |
| `deletedPhones` | Array | Previously deleted phone numbers |
| `deletedEmail` | Array | Previously deleted emails |
| `language` | String | Preferred language code |
| `deviceTokens` | Array | Push notification tokens |
| `phoneMetadata` | Object | Carrier info, country code |
| `deviceId` | String | Device identifier |
| `createdAt` | Date | Creation timestamp |

### Wallet
**Collection:** `wallets`

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Wallet ID |
| `accountId` | UUID | Owner account reference |
| `type` | Enum | `Checking` |
| `currency` | Enum | `BTC`, `USD` |
| `onchain` | Array | On-chain addresses with pubkeys |

**Indexes:**
- `id` (unique)
- `accountId`

### WalletInvoice (InvoiceUser)
**Collection:** `invoiceusers`

| Field | Type | Description |
|-------|------|-------------|
| `_id` | String | Payment hash (primary key) |
| `walletId` | UUID | Target wallet |
| `accountId` | UUID | Target account |
| `secret` | String (64 chars) | Payment secret |
| `currency` | Enum | `BTC`, `USD` |
| `cents` | Number | USD amount (for USD invoices) |
| `paid` | Boolean | Payment received |
| `processingCompleted` | Boolean | Ledger entry created |
| `paymentRequest` | String | BOLT11 invoice |
| `pubkey` | String | LND pubkey |
| `selfGenerated` | Boolean | Created by wallet owner |
| `externalId` | String | External reference ID |
| `timestamp` | Date | Creation time |

**Indexes:**
- `walletId, paid`
- `paid, processingCompleted`
- `accountId, externalId` (unique)

### Contact
**Collection:** `contacts`

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Contact ID |
| `accountId` | UUID | Owner account |
| `type` | Enum | `INTRALEDGER`, `LNADDRESS` |
| `handle` | String | Username or LN address |
| `displayName` | String | User-assigned alias |
| `transactionsCount` | Number | Number of transactions |
| `createdAt` | Date | First contact time |
| `updatedAt` | Date | Last transaction time |

**Indexes:**
- `id` (unique)
- `accountId, handle, type` (unique)

### Merchant
**Collection:** `merchants`

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Merchant ID |
| `username` | String | Account username |
| `title` | String | Business name |
| `location` | GeoJSON Point | GPS coordinates |
| `validated` | Boolean | Admin-approved |
| `deleted` | Boolean | Soft delete flag |
| `deletedAt` | Date | Deletion timestamp |
| `createdAt` | Date | Creation time |

**Indexes:**
- `id` (unique)
- `username`
- `location` (2dsphere)
- `validated, deleted`

### PaymentFlowState
**Collection:** `payment_flow_states`

Tracks in-flight payment state for idempotency and recovery.

| Field | Type | Description |
|-------|------|-------------|
| `senderWalletId` | UUID | Source wallet |
| `senderAccountId` | UUID | Source account |
| `settlementMethod` | String | `Lightning`, `OnChain`, `IntraLedger` |
| `paymentInitiationMethod` | String | How payment was initiated |
| `paymentHash` | String | LN payment hash |
| `intraLedgerHash` | String | Internal payment hash |
| `btcPaymentAmount` | Number | Amount in sats |
| `usdPaymentAmount` | Number | Amount in cents |
| `btcProtocolAndBankFee` | Number | Fee in sats |
| `usdProtocolAndBankFee` | Number | Fee in cents |
| `recipientWalletId` | UUID | Destination wallet |
| `paymentSentAndPending` | Boolean | Payment dispatched |
| `cachedRoute` | Object | Cached LN route |
| `createdAt` | Date | Payment initiated |

### WalletOnChainPendingReceive
**Collection:** `walletonchainpendingreceivers`

Tracks unconfirmed on-chain deposits.

| Field | Type | Description |
|-------|------|-------------|
| `walletId` | UUID | Destination wallet |
| `address` | String | Bitcoin address |
| `transactionHash` | String | On-chain txid |
| `vout` | Number | Output index |
| `walletAmount` | Number | Amount in wallet currency |
| `walletFee` | Number | Fee in wallet currency |
| `walletCurrency` | Enum | `BTC`, `USD` |
| `displayAmount` | String | Formatted display amount |
| `createdAt` | Date | Detection time |

**Indexes:**
- `walletId, createdAt`
- `transactionHash, vout` (unique)

### AccountIps
**Collection:** `accountips`

IP tracking for security and compliance.

| Field | Type | Description |
|-------|------|-------------|
| `accountId` | UUID | Account reference |
| `ip` | String | IP address |
| `metadata` | Object | GeoIP info (country, city, ASN, proxy) |
| `firstConnection` | Date | First seen |
| `lastConnection` | Date | Last seen |

### Quiz
**Collection:** `quizzes`

Gamification quiz completions.

| Field | Type | Description |
|-------|------|-------------|
| `accountId` | UUID | Account reference |
| `quizId` | String | Quiz identifier |
| `createdAt` | Date | Completion time |

### SupportChat
**Collection:** `supportchats`

AI support conversation tracking.

| Field | Type | Description |
|-------|------|-------------|
| `accountId` | UUID | Account reference |
| `supportChatId` | String | OpenAI thread ID |
| `createdAt` | Date | Chat started |

---

## PostgreSQL Tables (api-keys)

### identity_api_keys
**Migrations:** `core/api-keys/migrations/`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `identity_id` | UUID | Account ID reference |
| `name` | VARCHAR | API key name |
| `hashed_key` | VARCHAR | SHA-256 hash of key |
| `scopes` | TEXT[] | Permitted scopes (`READ`, `WRITE`, `RECEIVE`) |
| `expires_at` | TIMESTAMP | Optional expiry |
| `created_at` | TIMESTAMP | Creation time |

---

## PostgreSQL Tables (notifications)

### Users / Push Devices
Tracks registered devices for push notifications.

### Stateful Notifications
In-app notification storage with acknowledgment tracking.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Notification ID |
| `user_id` | UUID | Target user |
| `title` | TEXT | Notification title |
| `body` | TEXT | Notification body |
| `icon` | VARCHAR | Icon identifier |
| `deep_link` | TEXT | App deep link |
| `acknowledged` | BOOLEAN | User seen |
| `bulletin_enabled` | BOOLEAN | Show in bulletin |
| `created_at` | TIMESTAMP | Creation time |

### Email Reminder Projection
Tracks email reminder state.

### Notification Cool Off Tracker
Rate limiting for notifications.

---

## Ledger System (Medici)

The ledger uses the [medici](https://github.com/flash-oss/medici) double-entry accounting library with MongoDB.

**Collections:**
- `medici_journals` - Journal entries
- `medici_transactions` - Individual transaction legs

### Account Structure
```
Assets
├── Banking
│   ├── UserWallets (BTC and USD sub-accounts)
│   └── DealerWallets
├── Lightning
│   └── LND
└── OnChain
    └── Bria

Liabilities
├── UserWallets (mirror of assets)
└── DealerWallets

Revenue
├── RoutingFees
├── OnChainFees
└── BankOwnerFees
```

See `core/api/src/services/ledger/README.md` for detailed ledger documentation.

---

## Data Relationships

```
Account (1) ─────── (N) Wallet
    │                     │
    │                     └── (N) WalletInvoice
    │                     └── (N) WalletOnChainPendingReceive
    │
    ├── (1) User
    ├── (N) Contact
    ├── (N) Merchant
    ├── (N) Quiz
    ├── (N) AccountIps
    └── (1) SupportChat

Kratos Identity ─── Account (via kratosUserId)
```

---

## Key Domain Concepts

### Account Levels
- **Level 0**: Unverified, minimal limits
- **Level 1**: Phone verified
- **Level 2**: Identity verified
- **Level 3**: Business/high-volume

### Account Status
- `NEW`: Just created
- `PENDING`: Awaiting verification
- `ACTIVE`: Normal operation
- `LOCKED`: Temporarily suspended
- `CLOSED`: Permanently closed

### Wallet Currency
- `BTC`: Bitcoin (satoshi precision)
- `USD`: Synthetic USD (cent precision, hedged via dealer)

### Transaction Direction
- `SEND`: Outgoing payment
- `RECEIVE`: Incoming payment

### Settlement Methods
- `IntraLedger`: Internal transfer (instant, no fees)
- `Lightning`: LN payment (fast, low fees)
- `OnChain`: Bitcoin L1 (slower, higher fees)
