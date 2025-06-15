# LND Node Priority Configuration

This document explains how to configure separate LND node priorities for payments and invoice creation in the Blink backend.

## Overview

The Blink backend now supports configuring different LND node priorities for different operations:
- **Payment Priority**: Controls which LND node is preferred for outgoing payments and route finding
- **Invoice Priority**: Controls which LND node is preferred for invoice creation
- **Global Priority**: Fallback priority used when specific priorities are not set

## Environment Variables

### Global Priority (Existing)
```bash
LND_PRIORITY=lnd1  # or lnd2 (default: lnd1)
```

### Operation-Specific Priorities (New)
```bash
# Priority for payments and route finding
LND_PAYMENT_PRIORITY=lnd1  # or lnd2 (optional)

# Priority for invoice creation
LND_INVOICE_PRIORITY=lnd2  # or lnd1 (optional)
```

## Configuration Examples

### Example 1: Use lnd1 for payments, lnd2 for invoices
```bash
LND_PRIORITY=lnd1
LND_PAYMENT_PRIORITY=lnd1
LND_INVOICE_PRIORITY=lnd2
```

### Example 2: Use lnd2 for payments, lnd1 for invoices
```bash
LND_PRIORITY=lnd1
LND_PAYMENT_PRIORITY=lnd2
LND_INVOICE_PRIORITY=lnd1
```

### Example 3: Use global priority for both (backward compatible)
```bash
LND_PRIORITY=lnd2
# LND_PAYMENT_PRIORITY and LND_INVOICE_PRIORITY not set
# Both operations will use lnd2 (global priority)
```

## How It Works

### Priority Resolution
1. **For Payments**: Uses `LND_PAYMENT_PRIORITY` if set, otherwise falls back to `LND_PRIORITY`
2. **For Invoices**: Uses `LND_INVOICE_PRIORITY` if set, otherwise falls back to `LND_PRIORITY`
3. **For Other Operations**: Uses `LND_PRIORITY` (unchanged behavior)

### Affected Operations

#### Payment Operations (use LND_PAYMENT_PRIORITY)
- `findRouteForInvoice()` - Route finding for payments
- `findRouteForNoAmountInvoice()` - Route finding for no-amount invoices
- `payInvoiceViaPaymentDetails()` - Payment execution (uses same node as route probing when available)
- `payInvoiceViaRoutes()` - Payment via specific routes (always uses the node that performed the probing)

#### Invoice Operations (use LND_INVOICE_PRIORITY)
- `registerInvoice()` - Invoice creation
- Invoice-related operations

#### Unchanged Operations (use LND_PRIORITY)
- Balance queries
- Channel management
- On-chain operations
- General node information

## Implementation Details

### New Functions Added

#### In `auth.ts`:
- `createPriorityOrderedArray()` - Creates node arrays with specific priorities
- `lndsConnectForPayments` - Payment-prioritized node connections
- `lndsConnectForInvoices` - Invoice-prioritized node connections

#### In `config.ts`:
- `getLndsForPayments()` - Get nodes with payment priority
- `getLndsForInvoices()` - Get nodes with invoice priority
- `getActiveLndForPayments()` - Get active payment node
- `getActiveLndForInvoices()` - Get active invoice node

#### In `index.ts`:
- `listActiveLndForPayments()` - List active payment nodes
- `listActiveLndsWithPubkeysForInvoices()` - List active invoice nodes with pubkeys
- `probeForRouteWithLnd()` - Route probing with specific LND node
- Enhanced `payInvoiceViaPaymentDetails()` - Now accepts optional pubkey for node consistency

## Routing Consistency Guarantee

**Critical Feature**: The system ensures that payments are sent via the same LND node that performed the route probing:

1. **Route Probing**: When `findRouteForInvoice()` is called, it uses the payment-priority node and returns both the route and the pubkey of the node used
2. **Payment Execution**: When `payInvoiceViaRoutes()` is called with a route, it uses the exact same node (pubkey) that performed the probing
3. **Fallback Payments**: When `payInvoiceViaPaymentDetails()` is called without a route, it can optionally use a specific node for consistency

This ensures optimal routing performance and prevents issues where:
- Node A finds a route through its channels
- Node B tries to use that route but doesn't have the same channel state
- Payment fails due to routing inconsistency

## Backward Compatibility

This implementation is fully backward compatible:
- If `LND_PAYMENT_PRIORITY` and `LND_INVOICE_PRIORITY` are not set, the system uses `LND_PRIORITY` for all operations
- Existing configurations continue to work without changes
- No breaking changes to existing APIs

## Use Cases

### High-Liquidity Payment Node
Configure a node with better liquidity for outgoing payments:
```bash
LND_PAYMENT_PRIORITY=lnd1  # High-liquidity node for payments
LND_INVOICE_PRIORITY=lnd2  # Standard node for invoices
```

### Dedicated Invoice Node
Use a dedicated node for invoice creation to distribute load:
```bash
LND_PAYMENT_PRIORITY=lnd1  # Payment processing node
LND_INVOICE_PRIORITY=lnd2  # Dedicated invoice node
```

### Geographic Distribution
Route payments through geographically closer nodes:
```bash
LND_PAYMENT_PRIORITY=lnd2  # Node closer to payment destinations
LND_INVOICE_PRIORITY=lnd1  # Node closer to invoice recipients
```

## Monitoring and Debugging

The system logs which node is being used for each operation. Check the logs for:
- Payment operations: Look for "no active lightning node (for payments)" messages
- Invoice operations: Look for "no active lightning node (for invoices)" messages
- Node selection: Each operation logs which pubkey/node is being used

## Testing

To test the configuration:
1. Set different priorities for payments and invoices
2. Create an invoice - it should use the invoice-priority node
3. Make a payment - it should use the payment-priority node
4. Check logs to verify correct node selection
