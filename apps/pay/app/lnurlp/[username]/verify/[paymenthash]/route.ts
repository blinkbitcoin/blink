import { NextResponse } from "next/server"

import {
  LnurlpInvoicePaymentStatusByHashDocument,
  LnurlpInvoicePaymentStatusByHashQuery,
} from "@/lib/graphql/generated"
import { client } from "@/app/lnurlp/[username]/graphql"

export async function GET(
  request: Request,
  { params }: { params: { paymenthash: string } },
) {
  const { paymenthash } = params

  try {
    const { data } = await client.query<LnurlpInvoicePaymentStatusByHashQuery>({
      query: LnurlpInvoicePaymentStatusByHashDocument,
      variables: {
        input: {
          paymentHash: paymenthash,
        },
      },
      context: {
        "x-real-ip": request.headers.get("x-real-ip"),
        "x-forwarded-for": request.headers.get("x-forwarded-for"),
      },
      fetchPolicy: "no-cache",
    })

    const paymentStatus = data?.lnInvoicePaymentStatusByHash

    if (
      paymentStatus &&
      paymentStatus.status === "PAID" &&
      paymentStatus.paymentPreimage
    ) {
      return NextResponse.json({
        status: "OK",
        settled: true,
        pr: paymentStatus.paymentRequest,
        preimage: paymentStatus.paymentPreimage,
      })
    }

    if (paymentStatus && paymentStatus.status === "PENDING") {
      return NextResponse.json({
        status: "OK",
        settled: false,
        pr: paymentStatus.paymentRequest,
        preimage: null,
      })
    }

    if (paymentStatus && paymentStatus.status === "EXPIRED") {
      return NextResponse.json({
        status: "ERROR",
        reason: "Invoice expired.",
      })
    }

    return NextResponse.json({
      status: "ERROR",
      reason: "Invoice not paid or preimage not available.",
    })
  } catch (err) {
    console.error("Error verifying invoice:", err)
    return NextResponse.json({
      status: "ERROR",
      reason: "We could not verify the invoice. Please try again later.",
    })
  }
}
