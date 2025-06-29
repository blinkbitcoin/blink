import Link from "next/link"

import {
  InactiveMerchantsDocument,
  InactiveMerchantsQuery,
  InactiveMerchantsQueryVariables,
  MerchantsPendingApprovalDocument,
  MerchantsPendingApprovalQuery,
  MerchantsPendingApprovalQueryVariables,
} from "../../generated"
import { getClient } from "../graphql-rsc"
import { Merchants } from "../../components/merchants/details"

type Props = {
  searchParams: {
    inactive?: string
  }
}

export default async function MerchantScreen({ searchParams }: Props) {
  const { merchants, title } = await (async () => {
    if (searchParams?.inactive === "true") {
      const query = await getClient().query<
        InactiveMerchantsQuery,
        InactiveMerchantsQueryVariables
      >({
        query: InactiveMerchantsDocument,
      })
      return {
        merchants: query?.data.inactiveMerchants ?? [],
        title: "Inactive Merchants",
      }
    }

    const query = await getClient().query<
      MerchantsPendingApprovalQuery,
      MerchantsPendingApprovalQueryVariables
    >({
      query: MerchantsPendingApprovalDocument,
    })
    return {
      merchants: query?.data.merchantsPendingApproval ?? [],
      title: "Pending Merchants",
    }
  })()

  const inactive = searchParams.inactive

  return (
    <>
      <h1 className="mx-6 mt-6 text-2xl font-semibold text-gray-700">{title}</h1>
      <div className="flex p-6">
        <Link
          href="/merchants"
          className={`px-4 py-2 mr-2 text-sm font-medium rounded-md ${
            inactive !== "true"
              ? "bg-gray-700 text-white"
              : "text-gray-700 bg-gray-200 hover:bg-gray-300"
          }`}
        >
          Pending
        </Link>
        <Link
          href="/merchants?inactive=true"
          className={`px-4 py-2 text-sm font-medium rounded-md ${
            inactive === "true"
              ? "bg-gray-700 text-white"
              : "text-gray-700 bg-gray-200 hover:bg-gray-300"
          }`}
        >
          Inactive
        </Link>
      </div>
      <Merchants merchants={merchants} />
    </>
  )
}
