import React from "react"
import { headers } from "next/headers"

import TelegramAuthForm from "./telegram-auth-form"

import { handleAxiosError } from "@/app/error-handler"
import MainContent from "@/components/main-container"
import Card from "@/components/card"
import Logo from "@/components/logo"
import Heading from "@/components/heading"
import SubHeading from "@/components/sub-heading"
import authApi from "@/services/galoy-auth"

interface TelegramPassportProps {
  login_challenge: string
  phone: string
}

const TelegramPassportAuth = async ({
  searchParams,
}: {
  searchParams: TelegramPassportProps
}) => {
  const { login_challenge, phone } = searchParams

  if (!login_challenge || !phone) {
    throw new Error("Invalid Request: Missing login_challenge or phone")
  }

  const headersList = headers()
  const customHeaders = {
    "x-real-ip": headersList.get("x-real-ip"),
    "x-forwarded-for": headersList.get("x-forwarded-for"),
  }

  let authData = null
  let error = null

  try {
    authData = await authApi.getTelegramPassportRequestParams({
      phone,
      customHeaders,
    })
  } catch (err) {
    console.error("Error requesting Telegram Passport auth data:", err)
    const axiosError = handleAxiosError(err)
    error = axiosError.message
  }

  return (
    <MainContent>
      <Card>
        <Logo />
        <Heading>Login with Telegram Passport</Heading>
        <SubHeading>
          After authorizing in Telegram, you will be automatically logged in
        </SubHeading>

        {error && (
          <div className="mb-4 p-3 bg-red-100 border border-red-300 text-red-700 rounded-md">
            {error}
          </div>
        )}

        {authData && (
          <TelegramAuthForm
            login_challenge={login_challenge}
            phone={phone}
            authData={authData}
          />
        )}
      </Card>
    </MainContent>
  )
}

export default TelegramPassportAuth
