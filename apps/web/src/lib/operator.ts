import { createContext, useContext } from "react"

import { settingsTabs } from "./org-settings"

// Whether the organization the page shows is the operator organization: the one that runs the
// product and manages its feature flags (whoami's `operator`). The org layout provides it; pages
// only read it, to show the operator's settings tabs.

export const OperatorContext = createContext(false)

export const useIsOperator = (): boolean => useContext(OperatorContext)

/** The settings tabs for an organization's pages, the operator's included where they apply. */
export const useSettingsTabs = (slug: string) => settingsTabs(slug, useIsOperator())
