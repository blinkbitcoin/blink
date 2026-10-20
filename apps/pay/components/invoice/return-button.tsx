"use client"

import { useRouter } from "next/navigation"

import styles from "./index.module.css"

import { type ReturnInvoiceButtonProps } from "./index.types"

import { safeReturnUrl } from "@/lib/return-url"

function ReturnInvoiceButton({ returnUrl, type, children }: ReturnInvoiceButtonProps) {
  const router = useRouter()

  const cancelHandler = () => {
    const target = safeReturnUrl(returnUrl)
    if (target) {
      router.push(target)
      return
    }
    window.history.back()
  }

  const className = type === "primary" ? styles.primaryBtn : styles.secondaryBtn

  return (
    <button className={className} onClick={cancelHandler}>
      {children}
    </button>
  )
}
export default ReturnInvoiceButton
