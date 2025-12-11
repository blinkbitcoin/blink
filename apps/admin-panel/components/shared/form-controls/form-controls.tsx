"use client"

import { CheckboxProps, SelectInputProps, TextAreaProps, TextInputProps } from "./types"

const baseFieldClasses =
  "block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"

const checkboxClasses =
  "h-4 w-4 rounded border-gray-300 text-orange-500 focus:ring-orange-500"

export function TextInput({ className, ...rest }: TextInputProps) {
  const combined = className ? `${baseFieldClasses} ${className}` : baseFieldClasses
  return <input {...rest} className={combined} />
}

export function SelectInput({ className, children, ...rest }: SelectInputProps) {
  const combined = className ? `${baseFieldClasses} ${className}` : baseFieldClasses
  return (
    <select {...rest} className={combined}>
      {children}
    </select>
  )
}

export function TextArea({ className, ...rest }: TextAreaProps) {
  const combined = className ? `${baseFieldClasses} ${className}` : baseFieldClasses
  return <textarea {...rest} className={combined} />
}

export function Checkbox({ className, ...rest }: CheckboxProps) {
  const combined = className ? `${checkboxClasses} ${className}` : checkboxClasses
  return <input {...rest} type="checkbox" className={combined} />
}
