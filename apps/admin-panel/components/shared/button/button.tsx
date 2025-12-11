"use client"

import { ButtonProps, ButtonVariant } from "./types"

const baseClasses =
  "inline-flex items-center justify-center rounded-md focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"

const variantClasses: Record<ButtonVariant, string> = {
  "primary": "bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600",
  "outline-blue":
    "border border-blue-500 px-3 py-1 text-xs font-medium text-blue-500 hover:bg-blue-50",
  "outline-red":
    "border border-red-500 px-3 py-1 text-xs font-medium text-red-500 hover:bg-red-50",
}

export function Button({ variant = "primary", className, ...rest }: ButtonProps) {
  const variantClass = variantClasses[variant]
  const combined = className
    ? `${baseClasses} ${variantClass} ${className}`
    : `${baseClasses} ${variantClass}`

  return <button type={rest.type ?? "button"} {...rest} className={combined} />
}
