"use client"
import React from "react"
import { ThemeProvider } from "next-themes"

// Rendered beside the page, not around it. next-themes updates its context on
// mount, and React 18 then discards the server HTML of any still-hydrating
// (streamed) Suspense boundary inside the provider and re-renders it, replacing
// every element on the page right after load. Nothing here reads the theme
// context; the provider only keeps the data-theme attribute on <html> in sync.
export default function Theme() {
  return <ThemeProvider defaultTheme="system" />
}
