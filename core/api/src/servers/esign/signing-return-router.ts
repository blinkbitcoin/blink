import express, { Request, Response } from "express"

import { signingReturnPage } from "@/services/esign"

export const signingReturnRouter = express.Router({ caseSensitive: true })

signingReturnRouter.get("/signing/return", (req: Request, res: Response) => {
  const { event } = req.query
  const signingEvent = typeof event === "string" ? event : undefined

  const { html, contentSecurityPolicy } = signingReturnPage({ event: signingEvent })

  res
    .set({
      "Content-Security-Policy": contentSecurityPolicy,
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    })
    .type("html")
    .send(html)
})
