import { fetchBillingUsage } from "./usage"
import {
  type BillingAdapter,
  type BillingInvoice,
  type BillingPlan,
  type BillingSnapshot,
  BillingNotConnectedError,
  PRICE_PLACEHOLDER,
} from "./adapter"

// Fixture data shaped like the OrgBilling board. Every value here is sample data: the page labels
// the whole snapshot [SAMPLE DATA], prices stay [PRICE], and no plan limit or amount is invented.
// The plan copy and invoice dates are the board's own words. Seats used are NOT here: the page
// takes the real member count from the organization.

const PLANS: BillingPlan[] = [
  {
    id: "free",
    name: "Free",
    price: PRICE_PLACEHOLDER,
    perSeat: false,
    features: ["3 seats · 2 agents · community support"],
    seatCap: 3,
  },
  {
    id: "pro",
    name: "Pro",
    price: PRICE_PLACEHOLDER,
    perSeat: true,
    features: ["Up to 25 seats · unlimited agents · API keys"],
    seatCap: 25,
  },
  {
    id: "team",
    name: "Team",
    price: PRICE_PLACEHOLDER,
    perSeat: true,
    features: ["SSO · audit log · custom roles · priority support"],
    seatCap: null,
  },
]

const INVOICES: BillingInvoice[] = [
  { id: "inv_fixture_oct", date: "Oct 1, 2026", status: "paid", amount: "[AMOUNT]", url: null },
  { id: "inv_fixture_sep", date: "Sep 1, 2026", status: "paid", amount: "[AMOUNT]", url: null },
  { id: "inv_fixture_aug", date: "Aug 1, 2026", status: "paid", amount: "[AMOUNT]", url: null },
]

/** The snapshot the board shows. A fresh object each call, so callers can't mutate the fixture. */
export function fixtureSnapshot(): BillingSnapshot {
  return {
    sample: true,
    plans: PLANS.map((plan) => ({ ...plan, features: [...plan.features] })),
    subscription: {
      planId: "pro",
      renewsOn: "[RENEWAL DATE]",
      seats: 15,
      cancelAtPeriodEnd: false,
    },
    paymentMethod: "Card ending 4242 · expires 08/28",
    invoiceEmail: "billing@acme.dev",
    invoices: INVOICES.map((invoice) => ({ ...invoice })),
  }
}

/**
 * The adapter used until Stripe is configured. Reads return the fixture. Every change refuses
 * with BillingNotConnectedError, so nothing can be charged from here even if a control were enabled.
 */
export const fixtureBillingAdapter: BillingAdapter = {
  mode: "fixture",
  async load() {
    return fixtureSnapshot()
  },
  // Real: the API's own counter, the same in both modes.
  usage: fetchBillingUsage,
  async openPortal() {
    throw new BillingNotConnectedError()
  },
  async changePlan() {
    throw new BillingNotConnectedError()
  },
  async cancel() {
    throw new BillingNotConnectedError()
  },
}
