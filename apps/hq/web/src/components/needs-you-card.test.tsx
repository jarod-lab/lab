// @vitest-environment jsdom
import { expectNoA11yViolations } from "@lab/ui/a11y"
import { type RenderResult } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import type { NeedsYou } from "../api/schemas"
import { needsYouFixture, WORK_HEAD_SHA, WORK_IDS } from "../test/fixtures"
import { renderInRouter } from "../test/render"
import { type NeedsYouActions, NeedsYouCard, needKey } from "./needs-you-card"

const REPOS = ["acme/web"]

function actions(overrides: Partial<NeedsYouActions> = {}): NeedsYouActions {
  return {
    onApproveMerge: vi.fn(),
    onAnswer: vi.fn(),
    onRetry: vi.fn(),
    pending: null,
    errors: {},
    ...overrides,
  }
}

async function show(
  need: NeedsYou,
  a: NeedsYouActions = actions(),
): Promise<RenderResult & { a: NeedsYouActions }> {
  const view = await renderInRouter(<NeedsYouCard need={need} actions={a} repos={REPOS} />)
  return Object.assign(view, { a })
}

describe("NeedsYouCard: merge approval", () => {
  it("shows the id and kind, title, reason, the head sha and whether it is a draft", async () => {
    const view = await show(needsYouFixture("merge_approval"))
    expect(view.getByText("FAC-6 · merge approval")).toBeTruthy()
    expect(view.getByRole("article", { name: "Empty cart crashes the checkout" })).toBeTruthy()
    expect(view.container.textContent).toContain("Merge approval waits for a founder")
    expect(view.container.textContent).toContain(WORK_HEAD_SHA.slice(0, 7))
    expect(view.container.textContent).toMatch(/ready for review/)
    view.unmount()
    const draft = await show(
      needsYouFixture("merge_approval", {
        merge: {
          pullRequestUrl: "https://github.com/acme/web/pull/106",
          headSha: WORK_HEAD_SHA,
          number: 106,
          isDraft: true,
        },
      }),
    )
    expect(draft.container.textContent).toMatch(/draft/)
    expect(draft.container.textContent).not.toMatch(/ready for review/)
  })

  it("Approve merge asks first, naming the first 7 characters, and Confirm calls onApproveMerge once with the need", async () => {
    const need = needsYouFixture("merge_approval")
    const view = await show(need)
    const user = userEvent.setup()
    await user.click(view.getByRole("button", { name: "Approve merge" }))
    expect(view.a.onApproveMerge).not.toHaveBeenCalled()
    const group = view.getByRole("group", { name: "Approve merge" })
    expect(group.textContent).toContain(WORK_HEAD_SHA.slice(0, 7))
    expect(group.textContent).toMatch(/does not merge anything on GitHub/)
    await user.click(view.getByRole("button", { name: "Confirm" }))
    expect(view.a.onApproveMerge).toHaveBeenCalledTimes(1)
    expect(view.a.onApproveMerge).toHaveBeenCalledWith(need)
  })

  it("Review diff is a new-tab link only for hq's own pull request page of one of the repos", async () => {
    const good = await show(needsYouFixture("merge_approval"))
    const link = good.getByRole("link", { name: "Review diff" })
    expect(link.getAttribute("href")).toBe("https://github.com/acme/web/pull/106")
    expect(link.getAttribute("target")).toBe("_blank")
    expect(link.getAttribute("rel")).toBe("noreferrer noopener")
    good.unmount()
    for (const pullRequestUrl of [
      "javascript:alert(1)",
      "http://github.com/acme/web/pull/106",
      "https://github.com/acme/web/pull/106/files",
      "https://github.com/acme/web/pull/6",
      "https://github.com/Evil/web/pull/106",
      "",
    ]) {
      const need = needsYouFixture("merge_approval")
      const bad = await show({
        ...need,
        merge: { ...(need.merge as NonNullable<NeedsYou["merge"]>), pullRequestUrl },
      })
      expect(bad.queryByRole("link", { name: "Review diff" }), pullRequestUrl).toBeNull()
      bad.unmount()
    }
  })

  it("a repo compares case-insensitively", async () => {
    const need = needsYouFixture("merge_approval")
    const view = await renderInRouter(
      <NeedsYouCard
        need={{
          ...need,
          merge: {
            ...(need.merge as NonNullable<NeedsYou["merge"]>),
            pullRequestUrl: "https://github.com/Acme/Web/pull/106",
          },
        }}
        actions={actions()}
        repos={["acme/web"]}
      />,
    )
    expect(view.getByRole("link", { name: "Review diff" })).toBeTruthy()
  })
})

describe("NeedsYouCard: agent question", () => {
  it("lists the options with the default first and labelled (default), and a click answers", async () => {
    const need = needsYouFixture("agent_question", {
      question: {
        questionId: WORK_IDS.question,
        prompt: "Which one?",
        options: [
          { id: "a", label: "Alpha" },
          { id: "b", label: "Bravo", detail: "The safer one." },
          { id: "c", label: "Charlie" },
        ],
        defaultOptionId: "b",
      },
    })
    const view = await show(need)
    const buttons = view.getAllByRole("button")
    expect(buttons.map((b) => b.textContent)).toEqual(["Bravo (default)", "Alpha", "Charlie"])
    expect(view.getByText("The safer one.")).toBeTruthy()
    expect(view.getByText("Which one?")).toBeTruthy()
    // The recommendation is only shown.
    expect(view.a.onAnswer).not.toHaveBeenCalled()
    await userEvent.setup().click(view.getByRole("button", { name: "Alpha" }))
    expect(view.a.onAnswer).toHaveBeenCalledWith(WORK_IDS.question, "a")
    expect(view.a.onAnswer).toHaveBeenCalledTimes(1)
  })

  it("with no default (or one that is not an option) nothing is labelled default and the order stays", async () => {
    const need = needsYouFixture("agent_question")
    for (const defaultOptionId of [null, "missing"]) {
      const view = await show({
        ...need,
        question: { ...(need.question as NonNullable<NeedsYou["question"]>), defaultOptionId },
      })
      expect(view.getAllByRole("button").map((b) => b.textContent)).toEqual([
        "Half up",
        "Half to even",
      ])
      view.unmount()
    }
  })

  it("a card whose question is missing offers only the item link", async () => {
    const { question: _question, ...rest } = needsYouFixture("agent_question")
    const view = await show(rest)
    expect(view.queryAllByRole("button")).toHaveLength(0)
    expect(view.getByRole("link", { name: "Open item" }).getAttribute("href")).toBe(
      "/app/work/FAC-2",
    )
  })
})

describe("NeedsYouCard: attempt budget and stuck attempt", () => {
  it("attempt budget: Take over links to the item and Retry with notes needs a note, then sends it trimmed", async () => {
    const need = needsYouFixture("attempt_budget")
    const view = await show(need)
    const user = userEvent.setup()
    expect(view.getByRole("link", { name: "Take over" }).getAttribute("href")).toBe(
      "/app/work/FAC-5",
    )
    await user.click(view.getByRole("button", { name: "Retry with notes" }))
    const send = view.getByRole("button", { name: "Allow one more attempt" }) as HTMLButtonElement
    expect(send.disabled).toBe(true)
    expect(view.container.textContent).toMatch(/does not start one/)
    await user.type(view.getByLabelText("Notes for the next attempt"), "  look at the cursor  ")
    await user.click(send)
    expect(view.a.onRetry).toHaveBeenCalledTimes(1)
    expect(view.a.onRetry).toHaveBeenCalledWith(WORK_IDS.exhausted, "look at the cursor")
  })

  it("stuck attempt offers Open item only: hq refuses a retry while an attempt is still live", async () => {
    const view = await show(needsYouFixture("stuck_attempt"))
    expect(view.getByRole("link", { name: "Open item" }).getAttribute("href")).toBe(
      "/app/work/FAC-4",
    )
    expect(view.queryByRole("button", { name: /retry/i })).toBeNull()
    expect(view.queryAllByRole("button")).toHaveLength(0)
  })
})

describe("NeedsYouCard: busy, errors, text and layout", () => {
  it("while any write is pending every button is disabled; its own card is busy and shows its error", async () => {
    const need = needsYouFixture("agent_question")
    const own = await show(
      need,
      actions({ pending: needKey(need), errors: { [needKey(need)]: "Not accepted." } }),
    )
    expect(own.getByRole("article").getAttribute("aria-busy")).toBe("true")
    for (const button of own.getAllByRole("button")) {
      expect((button as HTMLButtonElement).disabled).toBe(true)
    }
    expect(own.getByRole("alert").textContent).toBe("Not accepted.")
    own.unmount()
    const other = await show(need, actions({ pending: "merge_approval:elsewhere" }))
    expect(other.getByRole("article").getAttribute("aria-busy")).toBeNull()
    for (const button of other.getAllByRole("button")) {
      expect((button as HTMLButtonElement).disabled).toBe(true)
    }
  })

  it("needKey is one key per card", () => {
    expect(needKey(needsYouFixture("merge_approval"))).toBe(`merge_approval:${WORK_IDS.review}`)
  })

  it("every text field renders as text only and long text wraps", async () => {
    const hostile = `<img src=x onerror=alert(1)> [a](https://evil.example) ${"C".repeat(5000)}`
    const need = needsYouFixture("agent_question")
    const view = await show({
      ...need,
      title: hostile,
      reason: hostile,
      question: {
        ...(need.question as NonNullable<NeedsYou["question"]>),
        prompt: hostile,
        options: [
          { id: "x", label: hostile, detail: hostile },
          { id: "y", label: "Fine" },
        ],
      },
    })
    expect(view.container.querySelector("img")).toBeNull()
    expect(view.container.querySelector("a[href*='evil']")).toBeNull()
    expect(view.container.querySelector("[style]")).toBeNull()
    for (const text of view.container.querySelectorAll("h3, p")) {
      expect(text.className).toContain("wrap-anywhere")
    }
    for (const button of view.container.querySelectorAll("button")) {
      expect(button.className).toContain("wrap-anywhere")
      expect(button.className).toContain("whitespace-normal")
      expect(button.className).toContain("h-auto")
    }
    await expectNoA11yViolations(view.container.innerHTML)
  })

  it("every control is min-h-touch and a11y is clean for each kind", async () => {
    for (const kind of [
      "merge_approval",
      "agent_question",
      "attempt_budget",
      "stuck_attempt",
    ] as const) {
      const view = await show(needsYouFixture(kind))
      for (const control of view.container.querySelectorAll("a, button, input, textarea")) {
        expect(control.className, `${kind} ${control.textContent}`).toContain("min-h-touch")
      }
      await expectNoA11yViolations(view.container.innerHTML)
      view.unmount()
    }
  })
})
