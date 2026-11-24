// The plain input types of the work operations (I10), so the data layer never imports an operation.
// The zod schemas of operations/work-schemas.ts must `satisfy` them.
import type { AttemptResult, SignalSource, VerifierKind } from "./machine"

export interface RecordSignalInput {
  source: SignalSource
  externalId: string // <= 200
  dedupeKey: string // <= 200
  repo: string // /^[\w.-]+\/[\w.-]+$/, lower-cased by hq
  title: string // <= 300
  summary: string // <= 300
  url?: string
  occurredAt?: string // ISO 8601
  payload?: Record<string, unknown> // <= 20 000 bytes serialized
}

export interface PullRequestCheck {
  name: string
  state: "passed" | "failed" | "pending"
}

export interface RecordPullRequestInput {
  itemId?: string
  branch: string
  number: number
  url: string
  // base, headSha, isDraft and state are required when the row does not exist yet
  base?: string
  headSha?: string
  isDraft?: boolean
  state?: "open" | "merged" | "closed"
  additions?: number
  deletions?: number
  files?: number
  checks?: PullRequestCheck[]
  mergedBy?: string
  mergedAt?: string // ISO 8601, only with state "merged"
}

export interface ContractInput {
  text: string
  verifier: { kind: VerifierKind; config?: Record<string, unknown> }
}

export interface QuestionOptionInput {
  id: string
  label: string
  detail?: string
}

export interface AskQuestionInput {
  itemId: string
  prompt: string
  options: QuestionOptionInput[] // 2 to MAX_QUESTION_OPTIONS
  defaultOptionId?: string // a recommendation only
  attemptId?: string
}

export interface FinishAttemptInput {
  attemptId: string
  result: Exclude<AttemptResult, "abandoned"> // abandoned is set by the sweep only
  note?: string
  files?: string[]
  branch?: string
  sessionId?: string
  reviewer?: { verdict: "approve" | "request_changes" | "reject"; summary: string }
}
