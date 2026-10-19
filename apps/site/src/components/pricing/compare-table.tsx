import { Fragment } from "react"

import { type Cell, comparison, plans } from "../../data/plans"

/** Every plan side by side, grouped. Scrolls sideways in its own box at phone width. */
export function CompareTable() {
  return (
    <section aria-labelledby="cmp-h" className="border-y bg-secondary">
      <div className="mx-auto flex max-w-300 flex-col gap-6 px-6 py-18">
        <h2 id="cmp-h" className="type-section">
          Compare plans
        </h2>
        {/* Browsers make a scrolling box keyboard-focusable themselves (Chrome 130+, Firefox). */}
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-170 border-collapse text-[15px]">
            <thead>
              <tr>
                <th scope="col" className="w-2/5 border-b-2 border-foreground py-3 text-left">
                  <span className="sr-only">Feature</span>
                </th>
                {plans.map((plan) => (
                  <th
                    key={plan.name}
                    scope="col"
                    className="border-b-2 border-foreground py-3 text-left text-[17px]"
                  >
                    <span className={plan.featured ? "highlight px-0.5" : undefined}>
                      {plan.name}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {comparison.map((group) => (
                <Fragment key={group.group}>
                  <tr>
                    <th
                      scope="colgroup"
                      colSpan={plans.length + 1}
                      className="border-b pt-5.5 pb-2 text-left type-eyebrow text-muted-foreground"
                    >
                      {group.group}
                    </th>
                  </tr>
                  {group.rows.map((row) => (
                    <tr key={row.label}>
                      <th scope="row" className="border-b py-2.75 text-left font-normal">
                        {row.label}
                      </th>
                      {row.cells.map((cell, i) => (
                        <td key={plans[i]?.name} className="border-b py-2.75 font-semibold">
                          <CellValue cell={cell} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

/** A tick or a dash for yes and no, each with words for screen readers. */
function CellValue({ cell }: { cell: Cell }) {
  if (cell === true)
    return (
      <>
        <span aria-hidden="true">✓</span>
        <span className="sr-only">Included</span>
      </>
    )
  if (cell === false)
    return (
      <>
        <span aria-hidden="true" className="text-muted-foreground">
          —
        </span>
        <span className="sr-only">Not included</span>
      </>
    )
  return cell
}
