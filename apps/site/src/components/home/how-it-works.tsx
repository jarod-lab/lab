const STEPS = [
  {
    title: "Connect your tools",
    body: "GitHub, Slack, Linear, Google Drive and [MORE]. Agents only get the access you grant.",
  },
  {
    title: "Describe the job",
    body: "“Every Friday, triage release blockers and draft fixes.” Plain words; no flowcharts.",
  },
  {
    title: "Approve and ship",
    body: "Review the work from your inbox. Approve, edit or reject — every choice is one key away.",
  },
]

/** Three numbered steps on the raised band. */
export function HowItWorks() {
  return (
    <section
      id="how-it-works"
      aria-labelledby="how-h"
      className="scroll-mt-4 border-y bg-secondary"
    >
      <div className="mx-auto flex max-w-300 flex-col gap-9 px-6 py-22">
        <h2 id="how-h" className="type-section">
          Running in an afternoon.
        </h2>
        <ol className="grid grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] gap-7">
          {STEPS.map((step, i) => (
            <li
              key={step.title}
              className="flex flex-col gap-2.5 border-t-[3px] border-foreground pt-4.5"
            >
              <span
                aria-hidden="true"
                className="text-[56px] leading-[0.9] font-extrabold tracking-[-0.04em]"
              >
                {i + 1}
              </span>
              <h3 className="text-[21px] font-extrabold">{step.title}</h3>
              <p className="text-secondary-foreground">{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
