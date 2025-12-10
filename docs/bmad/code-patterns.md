# Blink Code Patterns

**Generated**: 2025-12-09 | **Scan Level**: Deep | **Type**: Pattern Reference

## Overview

This document describes the coding patterns, conventions, and best practices used throughout the Blink codebase. Understanding these patterns is essential for AI-assisted development.

## Error Handling Patterns

### Result Pattern (TypeScript)

All domain and application operations return `Result | Error` instead of throwing:

```typescript
// domain/errors.ts
export class DomainError extends Error {
  level: ErrorLevel = ErrorLevel.Info
}

export class ValidationError extends DomainError {}
export class RepositoryError extends DomainError {}
export class CouldNotFindError extends RepositoryError {}

// Usage
export const validatePhoneNumber = (phone: string): PhoneNumber | ValidationError => {
  if (!isValidPhone(phone)) {
    return new InvalidPhoneNumber()
  }
  return phone as PhoneNumber
}

// Caller
const phone = validatePhoneNumber(input)
if (phone instanceof Error) return phone
// phone is now typed as PhoneNumber
```

### Error Hierarchy

```
Error
└── DomainError
    ├── ValidationError
    │   ├── InvalidPhoneNumber
    │   ├── InvalidSatoshiAmountError
    │   └── LimitsExceededError
    ├── RepositoryError
    │   ├── CouldNotFindError
    │   │   ├── CouldNotFindAccountError
    │   │   └── CouldNotFindWalletFromIdError
    │   └── PersistError
    ├── AuthorizationError
    │   └── UnauthorizedIPError
    └── OperationInterruptedError
```

### Error Levels

```typescript
export enum ErrorLevel {
  Info = "info",      // Normal operation, expected errors
  Warn = "warn",      // Unexpected but recoverable
  Critical = "critical", // Requires immediate attention
}
```

## Type Safety Patterns

### Branded Types (Newtypes)

Primitive types are wrapped to prevent mixing:

```typescript
// domain/shared/primitives.ts
declare const walletIdSymbol: unique symbol
export type WalletId = string & { [walletIdSymbol]: true }

declare const paymentHashSymbol: unique symbol
export type PaymentHash = string & { [paymentHashSymbol]: true }

// Validation factory
export const checkedToWalletId = (id: string): WalletId | ValidationError => {
  if (!isValidUuid(id)) return new InvalidWalletId()
  return id as WalletId
}
```

### Payment Amounts

```typescript
type PaymentAmount<T extends WalletCurrency> = {
  currency: T
  amount: bigint
}

type BtcPaymentAmount = PaymentAmount<"BTC">
type UsdPaymentAmount = PaymentAmount<"USD">

// Factory functions
export const checkedToBtcPaymentAmount = (
  amount: number
): BtcPaymentAmount | ValidationError => {
  if (amount < 0) return new InvalidNegativeAmountError()
  return { currency: WalletCurrency.Btc, amount: BigInt(amount) }
}
```

## Repository Pattern

### Interface Definition

```typescript
// domain/wallets/index.types.d.ts
interface WalletsRepository {
  findById(walletId: WalletId): Promise<Wallet | RepositoryError>
  findByAccountId(accountId: AccountId): Promise<Wallet[] | RepositoryError>
  update(wallet: Wallet): Promise<Wallet | RepositoryError>
}
```

### Mongoose Implementation

```typescript
// services/mongoose/wallets.ts
export const WalletsRepository = (): WalletsRepository => {
  const findById = async (walletId: WalletId) => {
    const wallet = await WalletModel.findOne({ id: walletId })
    if (!wallet) return new CouldNotFindWalletFromIdError()
    return walletFromDocument(wallet)
  }

  return { findById, ... }
}
```

## Application Layer Patterns

### Use Case Structure

```typescript
// app/payments/send-lightning.ts
export const payInvoiceByWalletId = async ({
  uncheckedPaymentRequest,
  memo,
  senderWalletId: uncheckedSenderWalletId,
  senderAccount,
}: PayInvoiceByWalletIdArgs): Promise<PaymentSendResult | ApplicationError> => {

  // 1. Add tracing attributes
  addAttributesToCurrentSpan({
    "payment.initiation_method": PaymentInitiationMethod.Lightning,
  })

  // 2. Validate inputs
  const validated = await validateInvoicePaymentInputs({
    uncheckedPaymentRequest,
    uncheckedSenderWalletId,
  })
  if (validated instanceof Error) return validated

  // 3. Build payment flow
  const paymentFlow = await getPaymentFlow(validated)
  if (paymentFlow instanceof Error) return paymentFlow

  // 4. Execute with appropriate handler
  if (paymentFlow.settlementMethod === SettlementMethod.IntraLedger) {
    return executePaymentViaIntraledger({ ... })
  }
  return executePaymentViaLn({ ... })
}
```

### Automatic Tracing Wrapper

All app functions are wrapped with OpenTelemetry spans:

```typescript
// app/index.ts
for (subModule in allFunctions) {
  for (const fn in allFunctions[subModule]) {
    allFunctions[subModule][fn] = wrapAsyncToRunInSpan({
      namespace: `app.${subModule.toLowerCase()}`,
      fn: allFunctions[subModule][fn],
    })
  }
}
```

## Distributed Locking Pattern

### Lock Service Usage

```typescript
// Ensures exclusive access to wallet during payment
const result = await LockService().lockWalletId(
  senderWalletId,
  async (signal) => {
    // Check if lock is still valid
    if (signal.aborted) {
      return new ResourceExpiredLockServiceError(signal.error?.message)
    }

    // Perform operation under lock
    return lockedPaymentSteps({ signal, ... })
  }
)
```

### Lock Implementation

```typescript
// services/lock/index.ts
export const LockService = () => ({
  lockWalletId: async <T>(
    walletId: WalletId,
    fn: (signal: WalletIdAbortSignal) => Promise<T>
  ) => {
    const lock = await redlock.acquire([`lock:wallet:${walletId}`], 30000)
    try {
      return await fn({ aborted: false })
    } finally {
      await lock.release()
    }
  }
})
```

## Domain Validation Pattern

### Validators

```typescript
// domain/accounts/validator.ts
export const AccountValidator = (account: Account) => {
  const validateWalletForAccount = (wallet: Wallet) => {
    if (wallet.accountId !== account.id) {
      return new AuthorizationError("Wallet does not belong to account")
    }
    return true
  }

  const validateCanWithdraw = (amount: UsdPaymentAmount) => {
    if (account.status === "locked") {
      return new InactiveAccountError()
    }
    return true
  }

  return { validateWalletForAccount, validateCanWithdraw }
}
```

### Checked Constructors

```typescript
// Unchecked → Checked with validation
const walletId = checkedToWalletId(uncheckedWalletId)
if (walletId instanceof Error) return walletId

const amount = checkedToBtcPaymentAmount(uncheckedAmount)
if (amount instanceof Error) return amount
```

## GraphQL Patterns

### Schema-First Design

```graphql
# graphql/public/schema.graphql
type Mutation {
  lnInvoicePaymentSend(input: LnInvoicePaymentInput!): PaymentSendPayload!
}

input LnInvoicePaymentInput {
  walletId: WalletId!
  paymentRequest: LnPaymentRequest!
  memo: Memo
}

type PaymentSendPayload {
  errors: [Error!]!
  status: PaymentSendStatus
  transaction: Transaction
}
```

### Resolver Implementation

```typescript
// graphql/public/root/mutation/ln-invoice-payment-send.ts
const LnInvoicePaymentSendMutation = GT.Field({
  type: GT.NonNull(PaymentSendPayload),
  args: {
    input: { type: GT.NonNull(LnInvoicePaymentInput) },
  },
  resolve: async (_, { input }, { domainAccount }) => {
    const { walletId, paymentRequest, memo } = input

    const result = await Payments.payInvoiceByWalletId({
      uncheckedPaymentRequest: paymentRequest,
      memo,
      senderWalletId: walletId,
      senderAccount: domainAccount,
    })

    if (result instanceof Error) {
      return { errors: [mapError(result)] }
    }

    return {
      errors: [],
      status: result.status,
      transaction: result.transaction,
    }
  },
})
```

### Error Mapping

```typescript
// graphql/error-map.ts
export const mapError = (error: ApplicationError): GraphQLError => {
  if (error instanceof InsufficientBalanceError) {
    return { code: "INSUFFICIENT_BALANCE", message: error.message }
  }
  if (error instanceof LimitsExceededError) {
    return { code: "LIMITS_EXCEEDED", message: error.message }
  }
  // ... more mappings
  return { code: "UNKNOWN_ERROR", message: "An unexpected error occurred" }
}
```

## Ledger Patterns

### Double-Entry Accounting

```typescript
// services/ledger/facade.ts
export const recordIntraledger = async ({
  description,
  amount,
  senderWalletDescriptor,
  recipientWalletDescriptor,
  metadata,
}: RecordIntraledgerArgs) => {
  const journal = await MainBook.entry(description)
    // Debit sender
    .debit(senderWalletDescriptor.id, amount.btc.amount, { ...metadata })
    // Credit recipient
    .credit(recipientWalletDescriptor.id, amount.btc.amount, { ...metadata })
    .commit()

  return { journalId: journal._id }
}
```

### Ledger Metadata

```typescript
export const LnSendLedgerMetadata = ({
  paymentHash,
  pubkey,
  paymentAmounts,
  ...
}) => ({
  metadata: {
    type: LedgerTransactionType.Payment,
    pending: true,
    hash: paymentHash,
    pubkey,
    feeKnownInAdvance,
  },
  debitAccountAdditionalMetadata: {
    displayAmount,
    displayCurrency,
  },
})
```

## Rust Service Patterns

### Event Sourcing (api-keys)

```rust
// core/api-keys/src/app/mod.rs
#[derive(Debug, Clone)]
pub struct ApiKey {
    events: Vec<ApiKeyEvent>,
    id: ApiKeyId,
    account_id: AccountId,
    // Derived state from events
    name: String,
    scopes: Vec<Scope>,
    revoked: bool,
}

impl ApiKey {
    pub fn create(account_id: AccountId, name: String, scopes: Vec<Scope>) -> Self {
        let event = ApiKeyEvent::Created { account_id, name, scopes };
        Self::from_events(vec![event])
    }

    pub fn revoke(&mut self) -> Result<(), ApiKeyError> {
        if self.revoked {
            return Err(ApiKeyError::AlreadyRevoked)
        }
        self.events.push(ApiKeyEvent::Revoked);
        self.revoked = true;
        Ok(())
    }
}
```

### Axum + async-graphql

```rust
// core/api-keys/src/server/mod.rs
pub fn router(app: ApiKeysApp) -> Router {
    let schema = Schema::build(Query, Mutation, EmptySubscription)
        .data(app)
        .finish();

    Router::new()
        .route("/graphql", post(graphql_handler))
        .route("/health", get(health_check))
        .layer(Extension(schema))
}

async fn graphql_handler(
    Extension(schema): Extension<ApiKeysSchema>,
    req: GraphQLRequest,
) -> GraphQLResponse {
    schema.execute(req.into_inner()).await.into()
}
```

### gRPC Server (notifications)

```rust
// core/notifications/src/grpc_server/mod.rs
#[tonic::async_trait]
impl NotificationsService for NotificationsServer {
    async fn send_push(
        &self,
        request: Request<SendPushRequest>,
    ) -> Result<Response<SendPushResponse>, Status> {
        let req = request.into_inner();

        self.app
            .send_push(req.device_token, req.title, req.body)
            .await
            .map_err(|e| Status::internal(e.to_string()))?;

        Ok(Response::new(SendPushResponse {}))
    }
}
```

## Testing Patterns

### Unit Tests (TypeScript)

```typescript
// test/unit/domain/payments/payment-flow.spec.ts
describe("PaymentFlow", () => {
  it("calculates correct fees for BTC wallet", () => {
    const flow = PaymentFlowBuilder()
      .withSender({ currency: "BTC", amount: 100000n })
      .withRecipient({ currency: "BTC" })
      .build()

    expect(flow.btcProtocolFee.amount).toBeLessThan(1000n)
  })
})
```

### Integration Tests (BATS)

```bash
# bats/gql/ln-send.bats
@test "can send lightning payment" {
  invoice=$(create_invoice "$recipient_wallet")

  run graphql_mutation "lnInvoicePaymentSend" \
    "walletId: \"$sender_wallet\"" \
    "paymentRequest: \"$invoice\""

  [[ "$status" -eq 0 ]]
  [[ "$(echo $output | jq -r '.data.lnInvoicePaymentSend.status')" == "SUCCESS" ]]
}
```

## Configuration Patterns

### Environment-Based Config

```typescript
// config/index.ts
import { createEnv } from "@t3-oss/env-core"
import { z } from "zod"

export const env = createEnv({
  server: {
    MONGODB_CON: z.string().url(),
    REDIS_MASTER_NAME: z.string(),
    LND_GRPC_HOST: z.string(),
    KRATOS_PUBLIC_URL: z.string().url(),
  },
  runtimeEnv: process.env,
})
```

### YAML Config (Rust)

```rust
// core/notifications/src/config.rs
#[derive(Debug, Deserialize)]
pub struct Config {
    pub database_url: String,
    pub fcm: FcmConfig,
    pub smtp: SmtpConfig,
}

impl Config {
    pub fn from_env() -> Result<Self, ConfigError> {
        config::Config::builder()
            .add_source(config::Environment::default())
            .build()?
            .try_deserialize()
    }
}
```

## Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Files | kebab-case | `send-lightning.ts` |
| Classes | PascalCase | `PaymentFlowBuilder` |
| Functions | camelCase | `payInvoiceByWalletId` |
| Constants | SCREAMING_SNAKE | `MAX_PAYMENT_AMOUNT` |
| Types | PascalCase | `WalletId`, `PaymentHash` |
| GraphQL Types | PascalCase | `PaymentSendPayload` |
| Rust structs | PascalCase | `ApiKey`, `Notification` |
| Rust functions | snake_case | `send_push`, `create_key` |

---

*This document provides pattern reference for AI-assisted development.*
