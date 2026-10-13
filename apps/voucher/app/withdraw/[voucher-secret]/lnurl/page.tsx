import React from "react"

import LnurlComponent from "./lnurl"

import { env } from "@/env"

type Props = {
  params: Promise<{
    "voucher-secret": string
  }>
}

export default async function Page({ params }: Props) {
  const { "voucher-secret": voucherSecret } = await params
  const voucherUrl = env.VOUCHER_URL
  return <LnurlComponent voucherSecret={voucherSecret} voucherUrl={voucherUrl} />
}
