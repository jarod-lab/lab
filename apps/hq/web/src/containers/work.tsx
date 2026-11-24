import { useQuery } from "@tanstack/react-query"
import { useRef, useState } from "react"

import { HqError } from "../api/errors"
import { hqKeys } from "../api/query-keys"
import type { NeedsYou } from "../api/schemas"
import { needKey, type NeedsYouActions } from "../components/needs-you-card"
import { ErrorBlock, errorMessage, LoadingBlock } from "../components/states"
import { useHq } from "../lib/use-hq"
import { WorkPage } from "../pages/work-page"

/** hq's words for a refused change; the rest of hq's errors read through the one error table. */
const CHANGED = "The pull request changed since you looked"
/** The search asks for this many matches (hq's maximum); more are said to exist. */
const SEARCH_LIMIT = 100
const CREATE_KEY = "create"

/**
 * What a refused write says. A 409, a 403 and a 400 keep hq's own message (hq is the one deciding
 * and its message is its own words, not a label of ours); hq's hint, which `HqError` drops, is
 * restored for the one refusal the board always meets: a pull request that moved on.
 */
export function writeMessage(error: unknown): string {
  if (error instanceof HqError) {
    if (error.kind === "conflict" && error.message.startsWith(CHANGED)) {
      return `${CHANGED}. Review it again.`
    }
    if (error.kind === "conflict" || error.kind === "forbidden" || error.kind === "bad-request") {
      return error.message
    }
  }
  return errorMessage(error)
}

/**
 * The Work board screen. It reads hq's board and renders it as it is. Every write is sent from a
 * click only, once (a synchronous lock closes the gap before React disables the buttons), never
 * retried, and one at a time: while a write is on its way nothing else on the board can be
 * clicked, and the card stays disabled until the board has been read again.
 */
export function Work() {
  const { client, queryClient } = useHq()
  const [query, setQuery] = useState("")
  const [pending, setPending] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState<string | null>(null)
  const [created, setCreated] = useState<string | null>(null)
  // True from the moment a write starts until it has settled: set synchronously, unlike `pending`.
  const sending = useRef(false)

  const board = useQuery({
    queryKey: hqKeys.workBoard(),
    queryFn: () => client.getWorkBoard(),
  })
  const term = query.trim()
  const search = useQuery({
    queryKey: hqKeys.workItems(term),
    queryFn: () => client.listWorkItems({ query: term, limit: SEARCH_LIMIT }),
    enabled: term !== "",
  })

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: hqKeys.work() }),
      queryClient.invalidateQueries({ queryKey: hqKeys.factoryStatus() }),
    ])

  /** One write: `send` returns the line to show when it worked. Never retried. */
  const write = async (key: string, send: () => Promise<string>): Promise<void> => {
    if (sending.current) return
    sending.current = true
    setPending(key)
    setNotice(null)
    setErrors(({ [key]: _cleared, ...rest }) => rest)
    try {
      const message = await send()
      // The card leaves only when the board says so; until then it stays disabled.
      await refresh()
      setNotice(message)
    } catch (error) {
      setErrors((current) => ({ ...current, [key]: writeMessage(error) }))
      if (error instanceof HqError && error.kind === "conflict") await refresh()
      // The session ended: the gate's probe sends the app to sign-in.
      if (error instanceof HqError && error.kind === "unauthorized") {
        await queryClient.invalidateQueries({ queryKey: hqKeys.status() })
      }
    } finally {
      sending.current = false
      setPending(null)
    }
  }

  const needs: NeedsYou[] = board.data?.needsYou ?? []
  const actions: NeedsYouActions = {
    pending,
    errors,
    onApproveMerge: (need) => {
      const merge = need.merge
      if (!merge) return
      void write(needKey(need), async () => {
        const reply = await client.approveMerge({ itemId: need.itemId, headSha: merge.headSha })
        return `Merge approved for ${need.displayId} at ${reply.headSha.slice(0, 7)}. Nothing was merged: merge it on GitHub.`
      })
    },
    onAnswer: (questionId, optionId) => {
      const need = needs.find((n) => n.question?.questionId === questionId)
      if (!need) return
      void write(needKey(need), async () => {
        await client.answerQuestion({ questionId, optionId })
        return `Answer sent for ${need.displayId}.`
      })
    },
    onRetry: (itemId, note) => {
      const need = needs.find((n) => n.itemId === itemId && n.kind === "attempt_budget")
      if (!need) return
      void write(needKey(need), async () => {
        await client.retryWorkItem({ itemId, note })
        return `One more fix attempt allowed for ${need.displayId}. None was started.`
      })
    },
  }

  if (board.data === undefined) {
    return board.isError ? (
      <ErrorBlock
        error={
          board.error instanceof HqError
            ? board.error
            : new HqError({ kind: "server", status: 0, message: "unexpected" })
        }
        onRetry={() => void board.refetch()}
      />
    ) : (
      <LoadingBlock label="the work board" />
    )
  }

  return (
    <WorkPage
      board={board.data}
      query={query}
      onQuery={setQuery}
      results={term === "" ? null : (search.data?.items ?? null)}
      {...(term !== "" && search.data === undefined
        ? {
            searchLoad: search.isError
              ? {
                  status: "error" as const,
                  error:
                    search.error instanceof HqError
                      ? search.error
                      : new HqError({ kind: "server", status: 0, message: "unexpected" }),
                  onRetry: () => void search.refetch(),
                }
              : { status: "loading" as const },
          }
        : {})}
      resultsTruncated={search.data?.nextCursor != null}
      creating={pending === CREATE_KEY}
      createError={errors[CREATE_KEY] ?? null}
      created={created}
      notice={notice}
      onCreate={(input) =>
        void write(CREATE_KEY, async () => {
          const reply = await client.createWorkItem(input)
          setCreated(reply.displayId)
          return `Created ${reply.displayId}. It is in Triage.`
        })
      }
      actions={actions}
    />
  )
}
