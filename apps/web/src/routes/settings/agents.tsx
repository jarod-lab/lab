import { createFileRoute } from "@tanstack/react-router"

import { createAgentsApi } from "../../lib/agents-api"
import { AgentsPage } from "../../pages/agents-page"

// Created once: the page's effects depend on this object, so a new one per render would reload.
const agentsApi = createAgentsApi()

export const Route = createFileRoute("/settings/agents")({
  component: AgentsRoute,
})

function AgentsRoute() {
  return <AgentsPage api={agentsApi} />
}
