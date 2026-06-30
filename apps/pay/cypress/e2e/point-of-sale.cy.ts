import { testData } from "../support/test-config"

const username = "test_user_a"
const usernamePhone = "+16505554320"
const cashRegisterUrl = `/${username}?amount=0&display=USD`

const setUsernameMutation = `
  mutation UserUpdateUsername($input: UserUpdateUsernameInput!) {
    userUpdateUsername(input: $input) {
      errors {
        message
      }
      user {
        id
      }
    }
  }
`

const accountDefaultWalletQuery = `
  query AccountDefaultWallet($username: Username!) {
    accountDefaultWallet(username: $username) {
      id
    }
  }
`

describe("Point of Sale", () => {
  before(() => {
    cy.loginAndGetToken(usernamePhone, testData.CODE)
      .then((authToken) => {
        return cy
          .request({
            method: "POST",
            url: "http://localhost:4455/graphql",
            headers: {
              Authorization: `Bearer ${authToken}`,
            },
            body: {
              query: setUsernameMutation,
              variables: {
                input: { username },
              },
            },
          })
          .then((response) => {
            expect(response.body.errors ?? []).to.have.length(0)
          })
      })
      .then(() => {
        cy.request({
          method: "POST",
          url: "http://localhost:4455/graphql",
          body: {
            query: accountDefaultWalletQuery,
            variables: { username },
          },
        }).then((response) => {
          expect(response.body.errors ?? []).to.have.length(0)
          expect(response.body.data.accountDefaultWallet.id).to.be.a("string")
        })
      })
  })

  it("should navigate to user cash register", () => {
    cy.visit("/")

    cy.get("[data-testid=username-input]").should("exist")
    cy.get("[data-testid=username-input]").type("test_user_a")
    cy.get("[data-testid=submit-btn]").click()

    cy.url().should("include", `/${username}`)
  })

  it("should navigate to printable paycode", () => {
    cy.visit(cashRegisterUrl)
    cy.get("[data-testid=menu]").click()
    cy.get("[data-testid=printable-paycode-link]").click()

    cy.url().should("include", "/print")
    cy.get("[data-testid=qrcode-container]").as("qrcodeContainer")
    cy.get("@qrcodeContainer").find("canvas").should("exist")
    cy.get("[data-testid=print-btn]").should("exist")
  })

  it("should have a valid keyboard", () => {
    cy.visit(cashRegisterUrl)

    cy.get("button[data-testid=digit-0-btn]").should("exist")
    cy.get("button[data-testid=digit-1-btn]").should("exist")
    cy.get("button[data-testid=digit-2-btn]").should("exist")
    cy.get("button[data-testid=digit-3-btn]").should("exist")
    cy.get("button[data-testid=digit-4-btn]").should("exist")
    cy.get("button[data-testid=digit-5-btn]").should("exist")
    cy.get("button[data-testid=digit-6-btn]").should("exist")
    cy.get("button[data-testid=digit-7-btn]").should("exist")
    cy.get("button[data-testid=digit-8-btn]").should("exist")
    cy.get("button[data-testid=digit-9-btn]").should("exist")
    cy.get("button[data-testid='digit-.-btn']").should("exist")
    cy.get("button[data-testid=backspace-btn]").should("exist")
    cy.get("button[data-testid=pay-btn]").should("exist")
  })

  it("should create an invoice", () => {
    cy.visit(cashRegisterUrl)
    cy.get("button[data-testid=digit-1-btn]").click()
    cy.get("button[data-testid=digit-0-btn]").click()
    cy.get("button[data-testid=pay-btn]").click()

    cy.url().should("include", "amount=10")
    cy.get("[data-testid=copy-btn]").should("exist")
    cy.get("[data-testid=share-lbl]").should("exist")
    cy.get("[data-testid=qrcode-container]").should("exist")
    cy.get("[data-testid=qrcode-container]").as("qrcodeContainer")
    cy.get("@qrcodeContainer").find("canvas").should("exist")
  })

  it("should create and pay an invoice", () => {
    cy.visit(cashRegisterUrl)
    cy.get("button[data-testid=digit-1-btn]").click()
    cy.get("button[data-testid=digit-0-btn]").click()
    cy.get("button[data-testid=pay-btn]").click()

    cy.get("[data-testid=copy-btn]").should("exist")
    cy.get("[data-testid=share-lbl]").should("exist")
    cy.get("[data-testid=qrcode-container]").should("exist")
    cy.get("[data-testid=qrcode-container]").as("qrcodeContainer")
    cy.get("@qrcodeContainer").find("canvas").should("exist")
    cy.get("[data-testid=copy-btn]").should("exist").click()

    cy.window()
      .then((win) => {
        win.focus()
        return win.navigator.clipboard.readText()
      })
      .then((text) => {
        const paymentRequest = text
        cy.log("Payment Request:", paymentRequest)

        cy.loginAndGetToken(testData.PHONE, testData.CODE).then((token) => {
          const authToken = token
          cy.log("authToken", authToken)

          cy.fetchMe(authToken).then((response) => {
            const walletId = response.body.data.me.defaultAccount.defaultWalletId
            cy.log("Wallet ID:", walletId)

            cy.sendInvoicePayment(paymentRequest, walletId, authToken)
              .then((paymentResponse) => {
                expect(paymentResponse.body.data.lnInvoicePaymentSend.status).to.equal(
                  "SUCCESS",
                )
              })
              .then(() => {
                cy.wait(3000)
                cy.get("[data-testid=success-icon]").should("exist")
                cy.get("[data-testid=success-icon]").should("be.visible")
              })
          })
        })
      })
  })
})
