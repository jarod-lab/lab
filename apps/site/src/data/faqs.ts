/** A question and its answer. The first one in a list starts open. */
export interface Faq {
  q: string
  a: string
}

export const homeFaqs: Faq[] = [
  {
    q: "Is our data used to train AI models?",
    a: "[State your policy plainly, e.g. “No. Customer data is never used to train models, ours or our providers’.”]",
  },
  {
    q: "What happens if an agent gets something wrong?",
    a: "Anything that leaves your workspace waits for approval by default, decisions can be undone for 30 seconds, and every step is logged so you can see exactly what happened.",
  },
  {
    q: "Which tools does it connect to?",
    a: "GitHub, Slack, Linear, Google Drive and [MORE], plus an API for everything else. Agents only get the scopes you grant.",
  },
  {
    q: "How does per-seat pricing work?",
    a: "You pay for people, not agents. Viewers are free on every plan. [Confirm before publishing.]",
  },
  {
    q: "How do you estimate energy use?",
    a: "[Explain the method and its limits, e.g. tokens × published per-token estimates for the model and region.]",
  },
  {
    q: "Can we try it before talking to sales?",
    a: "Yes. The Free plan has no time limit and no card. Pro has a 14-day trial.",
  },
]

export const billingFaqs: Faq[] = [
  {
    q: "What counts as a seat?",
    a: "Anyone who can start runs or approve actions. Viewers can see everything and are free on every plan.",
  },
  {
    q: "Can I change plans or seats anytime?",
    a: "Yes. Changes are prorated by Stripe, and you can manage everything yourself from Billing.",
  },
  {
    q: "What is “fair use” for runs?",
    a: "[Define the limit plainly before publishing, e.g. a monthly token budget per seat.]",
  },
  { q: "Do you offer discounts for nonprofits or education?", a: "[Your policy here.]" },
  {
    q: "How do I cancel?",
    a: "From Billing, in two clicks. You keep access until the end of the period you paid for.",
  },
]
