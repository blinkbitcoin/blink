import { authenticatedLndGrpc, unauthenticatedLndGrpc } from "lightning"

import {
  LND1_DNS,
  LND1_MACAROON,
  LND1_NAME,
  LND1_PUBKEY,
  LND1_RPCPORT,
  LND1_TLS,
  LND1_TYPE,
  LND2_DNS,
  LND2_MACAROON,
  LND2_NAME,
  LND2_PUBKEY,
  LND2_RPCPORT,
  LND2_TLS,
  LND2_TYPE,
  LND_PRIORITY,
  LND_PAYMENT_PRIORITY,
  LND_INVOICE_PRIORITY,
} from "@/config"

const addProps = (array: LndParams[]) => {
  const result: LndConnect[] = array.map((input) => {
    const socket = `${input.node}:${input.port}`
    return {
      ...input,
      socket,
      lnd: authenticatedLndGrpc({ ...input, socket }).lnd,
      lndGrpcUnauth: unauthenticatedLndGrpc({ ...input, socket }).lnd,
      active: false,
    }
  })
  return result
}

const lndArray: LndParams[] = []

if (
  LND1_PUBKEY &&
  LND1_TLS &&
  LND1_MACAROON &&
  LND1_DNS &&
  LND1_RPCPORT &&
  LND1_TYPE &&
  LND1_NAME
) {
  const lnd1 = {
    pubkey: LND1_PUBKEY,
    cert: LND1_TLS,
    macaroon: LND1_MACAROON,
    node: LND1_DNS,
    port: LND1_RPCPORT,
    type: LND1_TYPE,
    name: LND1_NAME,
  }
  lndArray.push(lnd1)
}

if (
  LND2_PUBKEY &&
  LND2_TLS &&
  LND2_MACAROON &&
  LND2_DNS &&
  LND2_RPCPORT &&
  LND2_TYPE &&
  LND2_NAME
) {
  const lnd2 = {
    pubkey: LND2_PUBKEY,
    cert: LND2_TLS,
    macaroon: LND2_MACAROON,
    node: LND2_DNS,
    port: LND2_RPCPORT,
    type: LND2_TYPE,
    name: LND2_NAME,
  }
  if (LND_PRIORITY === "lnd2") {
    lndArray.unshift(lnd2)
  } else {
    lndArray.push(lnd2)
  }
}

export const lndsConnect: LndConnect[] = addProps(lndArray)

// Create separate node arrays for different operations
const createPriorityOrderedArray = (priority?: string): LndParams[] => {
  const baseArray: LndParams[] = []

  // Add lnd1 if configured
  if (
    LND1_PUBKEY &&
    LND1_TLS &&
    LND1_MACAROON &&
    LND1_DNS &&
    LND1_RPCPORT &&
    LND1_TYPE &&
    LND1_NAME
  ) {
    const lnd1 = {
      pubkey: LND1_PUBKEY,
      cert: LND1_TLS,
      macaroon: LND1_MACAROON,
      node: LND1_DNS,
      port: LND1_RPCPORT,
      type: LND1_TYPE,
      name: LND1_NAME,
    }
    baseArray.push(lnd1)
  }

  // Add lnd2 if configured
  if (
    LND2_PUBKEY &&
    LND2_TLS &&
    LND2_MACAROON &&
    LND2_DNS &&
    LND2_RPCPORT &&
    LND2_TYPE &&
    LND2_NAME
  ) {
    const lnd2 = {
      pubkey: LND2_PUBKEY,
      cert: LND2_TLS,
      macaroon: LND2_MACAROON,
      node: LND2_DNS,
      port: LND2_RPCPORT,
      type: LND2_TYPE,
      name: LND2_NAME,
    }

    // Use specific priority if provided, otherwise fall back to global priority
    const effectivePriority = priority || LND_PRIORITY
    if (effectivePriority === "lnd2") {
      baseArray.unshift(lnd2)
    } else {
      baseArray.push(lnd2)
    }
  }

  return baseArray
}

// Export different node arrays for different operations
export const lndsConnectForPayments: LndConnect[] = addProps(createPriorityOrderedArray(LND_PAYMENT_PRIORITY))
export const lndsConnectForInvoices: LndConnect[] = addProps(createPriorityOrderedArray(LND_INVOICE_PRIORITY))
