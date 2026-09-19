import { testData } from "../support/test-config"

// The consent-test hydra client is registered with `read write` but the
// authorization request only asks for `read` (see dev/bin/setup-hydra-client.sh
// and dev/Tiltfile), so `write` is a valid scope for this client that was not
// part of this request.
const REQUESTED_SCOPE = "read"
const UNREQUESTED_SCOPE = "write"

const loginWithEmailToConsentScreen = (email: string) => {
  cy.flushRedis()
  cy.visit(testData.AUTHORIZATION_URL)
  cy.location("search").should((search) => {
    const params = new URLSearchParams(search)
    expect(params.has("login_challenge")).to.be.true
  })

  cy.get("[data-testid=sign_in_with_phone_btn]").should("be.visible").click()
  cy.get("[data-testid=sign_in_with_email_btn]").should("be.visible").click()
  cy.get("[data-testid=email_id_input]").should("not.be.disabled").type(email)
  cy.get("[data-testid=email_login_next_btn]").should("be.visible").click()

  cy.getOTP(email).then((code) => {
    cy.get("[data-testid=verification_code_input]").should("not.be.disabled").type(code)
  })

  cy.get("[data-testid=submit_consent_btn]")
    .should("be.visible")
    .should("not.be.disabled")
}

describe("Consent grant scope validation", () => {
  it("rejects a grant_scope that was not requested", () => {
    loginWithEmailToConsentScreen(testData.EMAIL)

    // The consent screen only offers the requested scope.
    cy.get("input[name=grant_scope]").then(($inputs) => {
      const offered = Array.from($inputs, (input) => (input as HTMLInputElement).value)
      expect(offered).to.include(REQUESTED_SCOPE)
      expect(offered).to.not.include(UNREQUESTED_SCOPE)
    })

    // Grant the requested scope ...
    cy.get(`input[name=grant_scope][value=${REQUESTED_SCOPE}]`).check({ force: true })

    // ... and add an extra grant_scope input to the form so the server action
    // receives it.
    cy.get("form").then(($form) => {
      const form = $form[0]
      const extraScope = form.ownerDocument.createElement("input")
      extraScope.type = "checkbox"
      extraScope.name = "grant_scope"
      extraScope.value = UNREQUESTED_SCOPE
      extraScope.checked = true
      form.appendChild(extraScope)
    })

    cy.get("[data-testid=submit_consent_btn]").click()

    // hydra redirects the rejection back to the client's redirect_uri
    // (http://localhost:3000 for this client) with an OAuth2 error.
    cy.location("search").should((search) => {
      const params = new URLSearchParams(search)
      expect(params.get("error")).to.eq("invalid_scope")
      expect(params.has("code")).to.be.false
    })
  })

  it("issues a code when only requested scopes are granted", () => {
    loginWithEmailToConsentScreen(testData.EMAIL)

    cy.get(`input[name=grant_scope][value=${REQUESTED_SCOPE}]`).check({ force: true })
    cy.get("[data-testid=submit_consent_btn]").click()

    cy.location("search").should((search) => {
      const params = new URLSearchParams(search)
      expect(params.has("error")).to.be.false
      expect(params.has("code")).to.be.true
    })
  })
})
