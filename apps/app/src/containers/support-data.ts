import type { SupportApi } from "../lib/support-api"
import { supportKeys } from "../lib/support-api"

// Query definitions shared by the admin console's access check and the support queue.

/**
 * Whether the person is support staff in the operator organization (the console's Support tab). The
 * answer changes only with a role change, so it is kept for a while.
 */
export const supportStaffQuery = (api: SupportApi, organizationId: string) => ({
  queryKey: supportKeys.staff(organizationId),
  queryFn: () => api.isStaff(organizationId),
  staleTime: 5 * 60_000,
})

/** The support staff for the queue's assignee and @mention pickers. */
export const supportStaffListQuery = (api: SupportApi, organizationId: string) => ({
  queryKey: supportKeys.staffList(organizationId),
  queryFn: () => api.listStaff(organizationId),
  staleTime: 5 * 60_000,
})

/** Support's answer to whether this session may work the queue. Not retried: 403 is an answer. */
export const supportQueueAccessQuery = (api: SupportApi) => ({
  queryKey: supportKeys.queueAccess(),
  queryFn: () => api.queueAccess(),
  retry: false,
})
