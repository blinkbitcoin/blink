import { testData } from "../support/test-config"

describe("Login Phone", () => {
  it("should be able to login via SMS", () => {
    cy.flushRedis()
    cy.visit(testData.AUTHORIZATION_URL)
    cy.location("search").should((search) => {
      const params = new URLSearchParams(search)
      expect(params.has("login_challenge")).to.be.true
    })

    cy.get("[data-testid=sign_in_with_email_btn]")
      .should("exist")
      .should("be.visible")
      .click()

    cy.get("[data-testid=sign_in_with_phone_btn]")
      .should("exist")
      .should("be.visible")
      .click()

    cy.get("[data-testid=phone_number_input]")
      .should("exist")
      .should("be.visible")
      .should("not.be.disabled")
      .type(testData.PHONE_NUMBER)

    cy.get("[data-testid=phone_number_channel_select]")
      .should("exist")
      .should("be.visible")
      .should("not.be.disabled")
      .select("SMS")

    cy.get("[data-testid=phone_login_next_btn]")
      .should("exist")
      .should("be.visible")
      .should("not.be.disabled")
      .click()

    cy.get("[data-testid=verification_code_input]")
      .should("exist")
      .should("be.visible")
      .should("not.be.disabled")
      .type(testData.VERIFICATION_CODE)

    cy.get("[data-testid=submit_consent_btn]")
      .should("exist")
      .should("be.visible")
      .should("not.be.disabled")
  })
})
