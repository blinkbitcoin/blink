import React from "react"

import VoucherSecret from "./voucher-secret"

import { env } from "@/env"

interface Params {
  params: Promise<{
    "voucher-secret": string
  }>
}

// this page shows the LNURLw screen after success in fund transfer to escrow account
export default async function Page({ params }: Params) {
  const { "voucher-secret": voucherSecret } = await params
  const voucherUrl = env.VOUCHER_URL
  return <VoucherSecret voucherSecret={voucherSecret} voucherUrl={voucherUrl} />
}
