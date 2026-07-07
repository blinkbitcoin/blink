/// <reference types="cypress" />
/* eslint-disable  @typescript-eslint/no-explicit-any */
// ***********************************************
// This example commands.ts shows you how to
// create various custom commands and overwrite
// existing commands.
//
// For more comprehensive examples of custom
// commands please read more here:
// https://on.cypress.io/custom-commands
// ***********************************************
//
//
// -- This is a parent command --
// Cypress.Commands.add('login', (email, password) => { ... })
//
//
// -- This is a child command --
// Cypress.Commands.add('drag', { prevSubject: 'element'}, (subject, options) => { ... })
//
//
// -- This is a dual command --
// Cypress.Commands.add('dismiss', { prevSubject: 'optional'}, (subject, options) => { ... })
//
//
// -- This will overwrite an existing command --
// Cypress.Commands.overwrite('visit', (originalFn, url, options) => { ... })
//
// declare global {
//   namespace Cypress {
//     interface Chainable {
//       login(email: string, password: string): Chainable<void>
//       drag(subject: string, options?: Partial<TypeOptions>): Chainable<Element>
//       dismiss(subject: string, options?: Partial<TypeOptions>): Chainable<Element>
//       visit(originalFn: CommandOriginalFn, url: string, options: Partial<VisitOptions>): Chainable<Element>
//     }
//   }

// eslint-disable-next-line @typescript-eslint/no-namespace
declare namespace Cypress {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface Chainable<Subject> {
    resetAuthRateLimits(identifier: string): Chainable<void>
    loginAndGetToken(phone: string, code: string): Chainable<string>
    graphqlOperation(
      query: string,
      token: string,
      variables?: Record<string, unknown>,
    ): Chainable<Response<any>>
    fetchMe(token: string): Chainable<Response<any>>
    sendInvoicePayment(
      paymentRequest: string,
      walletId: string,
      token: string,
    ): Chainable<Response<any>>
  }
}

Cypress.Commands.add("resetAuthRateLimits", (identifier) => {
  const command = `docker exec galoy-dev-redis-1 redis-cli DEL request_code_attempt_id:${identifier} request_phone_number_id:${identifier} login_attempt_id:${identifier}`
  cy.exec(command).then((result) => {
    if (result.code === 0) {
      cy.log("Auth rate-limit keys reset successfully")
    } else {
      throw new Error("Failed to reset auth rate-limit keys on Redis")
    }
  })
})

Cypress.Commands.add("loginAndGetToken", (phone, code) => {
  cy.resetAuthRateLimits(phone)
  cy.request({
    method: "POST",
    url: "http://localhost:4455/auth/phone/login",
    body: {
      phone,
      code,
    },
  }).then((response) => {
    expect(response.body).to.have.property("authToken")
    return response.body.authToken
  })
})

Cypress.Commands.add("graphqlOperation", (query, token, variables = {}) => {
  return cy.request({
    method: "POST",
    url: "http://localhost:4455/graphql",
    body: {
      query,
      variables,
    },
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
})

Cypress.Commands.add("fetchMe", (token) => {
  const query = `
    query Me {
      me {
        id
        defaultAccount {
          defaultWalletId
          displayCurrency
          id
          level
        }
      }
    }
  `
  return cy.graphqlOperation(query, token, {})
})

Cypress.Commands.add("sendInvoicePayment", (paymentRequest, walletId, token) => {
  const mutation = `
    mutation LnInvoicePaymentSend($input: LnInvoicePaymentInput!) {
      lnInvoicePaymentSend(input: $input) {
        errors {
          code
          message
          path
        }
        status
      }
    }
  `
  const variables = {
    input: {
      paymentRequest,
      walletId,
    },
  }
  return cy.graphqlOperation(mutation, token, variables)
})
