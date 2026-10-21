import type {
  SupportFetchClient,
  WireAgentTicket,
  WireCustomerTicket,
} from "@byo-oss/support/react"
import { vi } from "vitest"

const at = "2026-10-01T10:00:00.000Z"

/** A customer's ticket as support's API returns it. */
export function customerTicket(overrides: Partial<WireCustomerTicket> = {}): WireCustomerTicket {
  return {
    id: "t1",
    number: 42,
    subject: "Can't export runs",
    status: "pending",
    priority: null,
    channel: "web",
    organizationId: "org-a",
    visibility: "private",
    rating: null,
    createdAt: at,
    updatedAt: at,
    lastMessageAt: at,
    solvedAt: null,
    unread: true,
    isRequester: true,
    ...overrides,
  }
}

/** A ticket as support staff see it. */
export function agentTicket(overrides: Partial<WireAgentTicket> = {}): WireAgentTicket {
  return {
    id: "t1",
    number: 42,
    subject: "Can't export runs",
    status: "open",
    priority: null,
    channel: "web",
    userId: "user-2",
    requester: { id: "user-2", name: "Grace", email: "grace@example.com", image: null },
    organizationId: "org-b",
    visibility: "private",
    assigneeId: null,
    assignee: null,
    rating: null,
    verified: true,
    mergedIntoId: null,
    requesterSeenAt: null,
    agentSeenAt: null,
    lastMessageAt: at,
    solvedAt: null,
    createdAt: at,
    updatedAt: at,
    tags: [],
    unread: true,
    ...overrides,
  }
}

const ok = <T>(data: T) => ({ data, error: null })

/**
 * A SupportFetchClient whose calls succeed with one ticket by default. Override a method to make a
 * call fail: `{ error: { status: 404 } }`.
 */
export function fakeSupportClient(
  overrides: { tickets?: WireCustomerTicket[]; queue?: WireAgentTicket[] } = {},
) {
  const tickets = overrides.tickets ?? [customerTicket()]
  const queue = overrides.queue ?? [agentTicket()]
  const canned = Object.assign(
    vi.fn(async () => ok([])),
    {
      save: vi.fn(async () =>
        ok({ cannedReply: { id: "c1", title: "", body: "", createdAt: at, updatedAt: at } }),
      ),
      delete: vi.fn(async () => ok({ ok: true as const })),
    },
  )
  const client = {
    support: {
      createTicket: vi.fn(async () => ok({ ticket: customerTicket() })),
      myTickets: vi.fn(async () =>
        ok({ tickets, nextCursor: null, features: { attachments: false } }),
      ),
      ticket: vi.fn(async ({ query }: { query: { id: string } }) => {
        const ticket = tickets.find((row) => row.id === query.id)
        return ticket
          ? ok({ ticket, messages: [], attachments: [] })
          : { data: null, error: { status: 404, code: "TICKET_NOT_FOUND" } }
      }),
      reply: vi.fn(),
      updateMine: vi.fn(),
      markSeen: vi.fn(async () => ok({ ok: true as const })),
      agent: {
        tickets: vi.fn(async () =>
          ok({
            tickets: queue,
            nextCursor: null,
            counts: { open: queue.length, pending: 0, unassigned: queue.length, mine: 0 },
            features: { attachments: false, merge: false },
          }),
        ),
        ticket: vi.fn(async ({ query }: { query: { id: string } }) => {
          const ticket = queue.find((row) => row.id === query.id)
          return ticket
            ? ok({ ticket, messages: [], attachments: [] })
            : { data: null, error: { status: 404, code: "TICKET_NOT_FOUND" } }
        }),
        reply: vi.fn(),
        update: vi.fn(async () => ok({ updated: 1 })),
        delete: vi.fn(async () => ok({ deleted: 1 })),
        markSeen: vi.fn(async () => ok({ ok: true as const })),
        tags: vi.fn(async () => ok([])),
        canned,
      },
    },
    $fetch: vi.fn(async () => ({ data: null, error: null })),
  } satisfies SupportFetchClient
  return client
}
