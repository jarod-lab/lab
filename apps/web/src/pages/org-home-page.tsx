import { anchorLink, type RenderLink } from "@starter/ui/dplus/shell/link"

export interface OrgHomePageProps {
  organization: { name: string; slug: string }
  /** The caller's role label (Owner, Admin, Member, Viewer). */
  roleLabel: string
  renderLink?: RenderLink
}

/**
 * The organization's home ("Workspace"). It shows what exists today: the organization, the caller's
 * role and the pages that are built. Content the later pages provide is a placeholder.
 */
export function OrgHomePage({
  organization,
  roleLabel,
  renderLink = anchorLink,
}: OrgHomePageProps) {
  const Link = renderLink
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">Workspace</p>
        <h1 className="text-2xl font-semibold">{organization.name}</h1>
        <p className="text-sm text-muted-foreground">
          Your role: {roleLabel} · <span className="font-mono">/{organization.slug}</span>
        </p>
      </header>

      <section aria-labelledby="home-links" className="flex flex-col gap-3">
        <h2 id="home-links" className="text-lg font-semibold">
          Pages
        </h2>
        <ul className="flex flex-col gap-2">
          <li>
            <Link href={`/${organization.slug}/settings/agents`}>Agents</Link>
          </li>
          <li>
            <Link href={`/${organization.slug}/settings/general`}>Organization settings</Link>
          </li>
        </ul>
      </section>

      <section aria-labelledby="home-activity" className="flex flex-col gap-2">
        <h2 id="home-activity" className="text-lg font-semibold">
          Activity
        </h2>
        <p className="text-muted-foreground">[PLACEHOLDER] Recent agent runs appear here.</p>
      </section>
    </div>
  )
}
