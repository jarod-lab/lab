import { createContext, useContext } from "react"

// Whether the organization the page shows is the operator organization: the one that runs the
// product and manages its feature flags (whoami's `operator`). The org layout provides it;
// containers read it and pass `operator` to their pages, which add the operator's settings tabs.

export const OperatorContext = createContext(false)

export const useIsOperator = (): boolean => useContext(OperatorContext)
