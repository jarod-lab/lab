import { site } from "../../site"

const POINTS = [
  {
    title: "Passkeys and two-factor",
    body: "Phishing-resistant sign-in, breached-password checks.",
  },
  {
    title: "Roles, down to view-only",
    body: "Owner, admin, member and viewer for every organization.",
  },
  { title: "A record of every step", body: "Each agent action is logged with who approved it." },
  { title: "Scoped API keys", body: "Org-level keys with expiry and read-only options." },
  { title: "[COMPLIANCE STATUS]", body: "[e.g. SOC 2 Type II report available on request.]" },
  {
    title: "Your data, your models",
    body: "[State plainly whether customer data is used for training.]",
  },
]

/** "Built for the security review": what a reviewer asks first, answered in a grid. */
export function Security() {
  return (
    <section
      id="security"
      aria-labelledby="sec-h"
      className="mx-auto flex max-w-300 scroll-mt-4 flex-col gap-8 px-6 py-22"
    >
      <div className="flex flex-wrap items-end gap-6">
        <h2 id="sec-h" className="min-w-75 flex-1 type-section">
          Built for the security review.
        </h2>
        <a href={site.securityUrl} className="font-semibold underline underline-offset-3">
          Read the security overview
        </a>
      </div>
      <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(260px,100%),1fr))] border-t">
        {POINTS.map((point) => (
          <li key={point.title} className="flex flex-col gap-1 border-b py-4.5 pr-4.5">
            <strong>{point.title}</strong>
            <span className="text-[15px] text-secondary-foreground">{point.body}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
