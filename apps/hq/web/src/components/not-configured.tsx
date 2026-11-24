/**
 * The line beside a control hq cannot honour yet: what is not configured and when it arrives. The
 * control it sits beside is disabled; nothing here is a setting.
 */
export function NotConfigured({ phase, what }: { phase: string; what: string }) {
  return (
    <p role="note" className="m-0 text-xs text-faint">
      Not configured: {what}. Arrives in {phase}.
    </p>
  )
}
