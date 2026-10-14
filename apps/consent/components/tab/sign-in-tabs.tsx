"use client"
import { usePathname } from "next/navigation"
import React from "react"
import Image from "next/image"
import Link from "next/link"

const tabClassName = (isActive: boolean) =>
  `flex justify-center items-center p-2 gap-3 ${isActive ? "bg-[var(--backgroundColor)]" : "bg-[var(--inputBackground)] cursor-pointer"} rounded-lg w-1/2`

function Tab({
  testId,
  href,
  isActive,
  children,
}: {
  testId: string
  href: string
  isActive: boolean
  children: React.ReactNode
}) {
  // The active tab is not a link: navigating to the current page only re-renders
  // it from the server, replacing elements a user (or a test) is about to use
  if (isActive) {
    return (
      <div data-testid={testId} aria-current="page" className={tabClassName(true)}>
        {children}
      </div>
    )
  }

  // A real link also works before hydration, unlike an onClick handler
  return (
    <Link data-testid={testId} href={href} replace className={tabClassName(false)}>
      {children}
    </Link>
  )
}

function SignInTab({ login_challenge }: { login_challenge: string }) {
  const pathname = usePathname()
  const isPhoneLogin = pathname.includes("/login/phone")
  const challenge = encodeURIComponent(login_challenge)

  return (
    <div className="flex flex-row w-full justify-center items-center gap-1 mb-3 bg-[var(--inputBackground)] p-1 rounded-lg">
      <Tab
        testId="sign_in_with_email_btn"
        href={`/login?login_challenge=${challenge}`}
        isActive={!isPhoneLogin}
      >
        <Image src="/logo/email.svg" alt="email" width={20} height={20} />
        <p className="font-semibold text-sm">Email</p>
      </Tab>
      <Tab
        testId="sign_in_with_phone_btn"
        href={`/login/phone?login_challenge=${challenge}`}
        isActive={isPhoneLogin}
      >
        <Image src="/logo/phone.svg" alt="phone" width={20} height={20} />
        <p className="font-semibold text-sm">Phone</p>
      </Tab>
    </div>
  )
}

export default SignInTab
