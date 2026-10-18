import { createColumnHelper, tableFeatures, useTable } from "@tanstack/react-table"
import { useId, useMemo, useState } from "react"
import { cn } from "cn"

import { Button } from "@starter/ui/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@starter/ui/components/ui/table"
import { Meter } from "@starter/ui/dplus/meter"
import { type RenderLink, anchorLink } from "@starter/ui/dplus/shell/link"
import { SettingsHeader } from "@starter/ui/dplus/shell/settings-header"
import { ViewOnlyNotice } from "@starter/ui/dplus/shell/view-only-notice"

import { Progress, ProgressLabel } from "@starter/ui/components/ui/progress"

import {
  type BillingInvoice,
  type BillingMode,
  type BillingPlan,
  type BillingSnapshot,
  type BillingUsage,
  NOT_CONNECTED_REASON,
  SAMPLE_LABEL,
} from "../lib/billing/adapter"
import { ConfirmDialog } from "../components/confirm-dialog"
import { settingsTabs } from "../lib/org-settings"

export interface OrgBillingPageProps {
  organization: { name: string; slug: string }
  /** The caller's role as the page words it, e.g. "Owner". */
  roleLabel: string
  /** Owners and admins. Anyone else sees the page read-only (the container hides it from them). */
  canChange: boolean
  mode: BillingMode
  snapshot: BillingSnapshot
  /** Today's metered requests, or null while they load. Real data, so no sample label. */
  usage: BillingUsage | null
  /** Members in the organization: the seats in use. */
  seatsUsed: number
  /** A change is in flight: its controls are disabled. */
  pending: boolean
  actionError: string | null
  /** Opens the provider's portal in a new tab (card, billing email, invoices, seats). */
  onOpenPortal: () => void
  /** Starts a plan change for `planId` in a new tab. */
  onChangePlan: (planId: string) => void
  /** Cancels at the end of the period. Called after the person confirms. */
  onCancel: () => void
  renderLink?: RenderLink
}

const features = tableFeatures({})
const helper = createColumnHelper<typeof features, BillingInvoice>()

/** The sample-data label the board uses (DirLift's `[SAMPLE DATA]`). */
function SampleTag({ show }: { show: boolean }) {
  if (!show) return null
  return <span className="text-[13px] font-normal text-muted-foreground">{SAMPLE_LABEL}</span>
}

/**
 * The organization's billing page (board OrgBilling). Everything the provider owns is a control
 * that opens the provider in a new tab; in the fixture every control is disabled, with the reason.
 */
export function OrgBillingPage({
  organization,
  roleLabel,
  canChange,
  mode,
  snapshot,
  usage,
  seatsUsed,
  pending,
  actionError,
  onOpenPortal,
  onChangePlan,
  onCancel,
  renderLink = anchorLink,
}: OrgBillingPageProps) {
  const reasonId = useId()
  const [confirmCancel, setConfirmCancel] = useState(false)
  const connected = mode === "stripe"
  const enabled = connected && canChange && !pending
  const reason = !connected ? NOT_CONNECTED_REASON : "Only an owner or admin can change billing"
  const current = snapshot.subscription
  const currentPlan = snapshot.plans.find((plan) => plan.id === current?.planId) ?? null
  const currentIndex = snapshot.plans.findIndex((plan) => plan.id === current?.planId)
  const seatTotal = current?.seats ?? null

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SettingsHeader
        title="Organization settings"
        context={`${organization.name} · you are ${roleLabel}`}
        tabs={settingsTabs(organization.slug)}
        activeTab="billing"
        renderLink={renderLink}
      />

      <div className="flex max-w-[1040px] flex-col gap-[18px] px-4 py-6 md:px-9">
        <p className="text-sm text-muted-foreground">
          Payments are handled by Stripe. Buttons marked <span aria-hidden="true">↗</span>
          <span className="sr-only">with an arrow</span> open Stripe&apos;s secure portal in a new
          tab.
        </p>

        {!connected ? (
          <section
            aria-label="Billing status"
            className="flex flex-col gap-1 rounded-lg border-2 border-dashed border-muted-foreground p-3.5 text-sm"
          >
            <p className="font-semibold">{NOT_CONNECTED_REASON}.</p>
            <p className="text-muted-foreground">
              Every figure on this page is sample data, and nothing can be charged or changed from
              here.
            </p>
          </section>
        ) : null}

        {!canChange ? (
          <ViewOnlyNotice subject={organization.name}>
            Only an owner or admin can change the plan, seats, payment method or invoices.
          </ViewOnlyNotice>
        ) : null}

        <span id={reasonId} className="sr-only">
          {reason}
        </span>

        {actionError ? (
          <p role="alert" className="text-sm text-destructive">
            {actionError}
          </p>
        ) : null}

        <section
          aria-labelledby="plan-h"
          className="flex flex-col gap-4 rounded-xl border-2 border-foreground p-4 md:flex-row md:items-center md:gap-7 md:px-5"
        >
          <div className="flex flex-1 flex-col gap-1">
            <span className="flex items-center gap-2 text-[13px] text-muted-foreground">
              Current plan <SampleTag show={snapshot.sample} />
            </span>
            <h2 id="plan-h" className="text-[34px] leading-none font-extrabold tracking-tight">
              {currentPlan?.name ?? (current ? current.planId : "Free")}
            </h2>
            {current ? (
              <span className="text-[14.5px] text-muted-foreground">
                {currentPlan?.perSeat && currentPlan.price
                  ? `${currentPlan.price} per seat / month · `
                  : ""}
                {current.renewsOn ? `renews ${current.renewsOn}` : "no renewal date"}
                {current.cancelAtPeriodEnd ? " · cancels at period end" : ""}
              </span>
            ) : (
              <span className="text-[14.5px] text-muted-foreground">No paid plan</span>
            )}
          </div>

          <div className="flex min-w-0 flex-col gap-1.5 md:min-w-[220px]">
            {seatTotal !== null ? (
              <>
                <span className="flex items-center gap-2 text-sm font-semibold">
                  {`${seatsUsed} of ${seatTotal} seats used`}
                  <SampleTag show={snapshot.sample} />
                </span>
                <Meter
                  value={seatsUsed}
                  max={seatTotal}
                  label={`${seatsUsed} of ${seatTotal} seats used`}
                  cell="tall"
                />
              </>
            ) : null}
          </div>

          <div className="flex flex-col gap-2 md:min-w-[260px]">
            <Button
              variant="default"
              className="min-h-11 w-full"
              disabled={!enabled}
              aria-describedby={enabled ? undefined : reasonId}
              onClick={onOpenPortal}
            >
              Manage subscription <span aria-hidden="true">↗</span>
            </Button>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="min-h-10 flex-1"
                disabled={!enabled}
                aria-describedby={enabled ? undefined : reasonId}
                onClick={onOpenPortal}
              >
                Change seats
              </Button>
              <Button
                variant="destructive"
                className="min-h-10 flex-1"
                disabled={!enabled || !current}
                aria-describedby={enabled ? undefined : reasonId}
                onClick={() => setConfirmCancel(true)}
              >
                Cancel plan <span aria-hidden="true">↗</span>
              </Button>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="flex items-center gap-3 rounded-xl border border-border p-3.5 md:px-4">
            <div className="flex flex-1 flex-col">
              <span className="flex items-center gap-2 text-[13px] text-muted-foreground">
                Payment method <SampleTag show={snapshot.sample && !!snapshot.paymentMethod} />
              </span>
              <span className="font-semibold">{snapshot.paymentMethod ?? "Shown in Stripe"}</span>
            </div>
            <Button
              variant="link"
              className="min-h-11 px-0"
              disabled={!enabled}
              aria-describedby={enabled ? undefined : reasonId}
              onClick={onOpenPortal}
            >
              Update in Stripe <span aria-hidden="true">↗</span>
            </Button>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-border p-3.5 md:px-4">
            <div className="flex flex-1 flex-col">
              <span className="flex items-center gap-2 text-[13px] text-muted-foreground">
                Invoices go to <SampleTag show={snapshot.sample && !!snapshot.invoiceEmail} />
              </span>
              <span className="font-semibold">{snapshot.invoiceEmail ?? "Set in Stripe"}</span>
            </div>
            <Button
              variant="outline"
              className="min-h-11"
              disabled={!enabled}
              aria-describedby={enabled ? undefined : reasonId}
              onClick={onOpenPortal}
            >
              Edit
            </Button>
          </div>
        </div>

        {usage ? <UsageCard usage={usage} /> : null}

        <section aria-labelledby="plans-h" className="flex flex-col gap-2">
          <h3 id="plans-h" className="flex items-center gap-2 text-base font-bold">
            Plans <SampleTag show={snapshot.sample} />
          </h3>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {snapshot.plans.map((plan, index) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                isCurrent={plan.id === current?.planId}
                direction={index > currentIndex ? "upgrade" : "downgrade"}
                enabled={enabled}
                reasonId={reasonId}
                onChange={() => onChangePlan(plan.id)}
              />
            ))}
          </div>
        </section>

        <InvoicesSection
          invoices={snapshot.invoices}
          sample={snapshot.sample}
          onOpenPortal={onOpenPortal}
          canOpen={enabled}
          reasonId={reasonId}
        />

        <ConfirmDialog
          open={confirmCancel}
          onOpenChange={setConfirmCancel}
          title={`Cancel the ${currentPlan?.name ?? "current"} plan?`}
          description={`The plan stays on until the end of the current period${current?.renewsOn ? ` (${current.renewsOn})` : ""}. Stripe asks you to confirm the cancellation on its page, which opens in a new tab.`}
          cancelLabel="Keep plan"
          confirmLabel={
            <>
              Cancel plan <span aria-hidden="true">↗</span>
            </>
          }
          destructive
          onConfirm={() => {
            setConfirmCancel(false)
            onCancel()
          }}
        />
      </div>
    </div>
  )
}

/** Today's requests against the daily limit. Not on the board: a real figure from the API. */
function UsageCard({ usage }: { usage: BillingUsage }) {
  const percent = usage.limit > 0 ? Math.min(100, (usage.total / usage.limit) * 100) : 0
  return (
    <section aria-label="Requests today" className="rounded-xl border border-border p-3.5 md:px-4">
      <Progress value={percent}>
        <ProgressLabel>{`Requests today: ${usage.total} of ${usage.limit}`}</ProgressLabel>
      </Progress>
      <p className="mt-1.5 text-[13px] text-muted-foreground">
        Counted per UTC day ({usage.day}). Resets at midnight UTC.
      </p>
    </section>
  )
}

function PlanCard({
  plan,
  isCurrent,
  direction,
  enabled,
  reasonId,
  onChange,
}: {
  plan: BillingPlan
  isCurrent: boolean
  direction: "upgrade" | "downgrade"
  enabled: boolean
  reasonId: string
  onChange: () => void
}) {
  const price = plan.price ? (plan.perSeat ? `${plan.price} / seat` : plan.price) : null
  return (
    <div
      className={
        isCurrent
          ? "flex flex-col gap-1.5 rounded-xl border-2 border-foreground px-4 py-3.5"
          : "flex flex-col gap-1.5 rounded-xl border border-border px-4 py-3.5"
      }
    >
      <div className="flex items-baseline gap-2">
        <strong className="text-[17px]">
          {isCurrent ? <span className="highlight px-0.5">{plan.name}</span> : plan.name}
        </strong>
        {price ? <span className="text-[13.5px] text-muted-foreground">{price}</span> : null}
      </div>
      {plan.features.map((line) => (
        <span key={line} className="text-[13.5px] text-muted-foreground">
          {line}
        </span>
      ))}
      <div className="mt-auto">
        {isCurrent ? (
          <span className="text-sm font-bold">Current plan</span>
        ) : (
          // A link on the board; the negative margin keeps its 44px target without
          // making the card taller than a line of text.
          <Button
            variant="link"
            className={cn("-my-3 px-0", direction === "upgrade" ? "font-semibold" : "font-normal")}
            disabled={!enabled}
            aria-describedby={enabled ? undefined : reasonId}
            onClick={onChange}
          >
            {direction === "upgrade" ? "Upgrade" : "Downgrade"} <span aria-hidden="true">↗</span>
          </Button>
        )}
      </div>
    </div>
  )
}

function InvoicesSection({
  invoices,
  sample,
  onOpenPortal,
  canOpen,
  reasonId,
}: {
  invoices: BillingInvoice[] | null
  sample: boolean
  onOpenPortal: () => void
  canOpen: boolean
  reasonId: string
}) {
  const columns = useMemo(
    () =>
      helper.columns([
        helper.display({
          id: "date",
          header: "Date",
          cell: (info) => info.row.original.date,
        }),
        helper.display({
          id: "status",
          header: "Status",
          cell: (info) => {
            const status = info.row.original.status
            if (status !== "paid") return <span className="capitalize">{status}</span>
            return (
              <span className="inline-flex items-center gap-1.5 text-success">
                <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                  <path
                    d="M3.5 8.5l3 3 6-7"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span className="text-foreground">Paid</span>
              </span>
            )
          },
        }),
        helper.display({
          id: "amount",
          header: "Amount",
          cell: (info) => (
            <span className="text-muted-foreground">{info.row.original.amount ?? "—"}</span>
          ),
        }),
        helper.display({
          id: "links",
          header: () => <span className="sr-only">Links</span>,
          cell: (info) => {
            const { url } = info.row.original
            if (url) {
              return (
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm underline underline-offset-3"
                >
                  View in Stripe <span aria-hidden="true">↗</span>
                </a>
              )
            }
            return (
              <Button variant="link" className="min-h-11" disabled aria-describedby={reasonId}>
                View in Stripe <span aria-hidden="true">↗</span>
              </Button>
            )
          },
        }),
      ]),
    [reasonId],
  )

  const table = useTable({ features, columns, data: invoices ?? [] })

  return (
    <section aria-labelledby="inv-h" className="flex flex-col gap-2">
      <h3 id="inv-h" className="flex items-center gap-2 text-base font-bold">
        Invoices <SampleTag show={sample && invoices !== null} />
      </h3>
      {invoices === null ? (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="text-muted-foreground">
            Invoices are listed in Stripe&apos;s portal.
          </span>
          {canOpen ? (
            <Button variant="outline" className="min-h-11" onClick={onOpenPortal}>
              Open billing portal <span aria-hidden="true">↗</span>
            </Button>
          ) : null}
        </div>
      ) : (
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id}>
                {group.headers.map((header) => (
                  <TableHead key={header.id}>
                    <table.FlexRender header={header} />
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getAllCells().map((cell) => (
                  <TableCell key={cell.id}>
                    <table.FlexRender cell={cell} />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  )
}
