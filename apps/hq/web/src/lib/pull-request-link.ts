/**
 * The one check before a pull request url becomes a link: it must be exactly
 * `https://github.com/<repo>/pull/<number>` for one of the item's repos (case aside). hq already
 * rebuilds the url from the item's repo and number, so this is the second lock: a url that is
 * anything else (another host, a query, a path below the pull request, another number, a script
 * url) is shown as no link at all. Returns the url to link to, or null.
 */
export function pullRequestLink(
  url: string,
  number: number,
  repos: readonly string[],
): string | null {
  const given = url.toLowerCase()
  for (const repo of repos) {
    if (given === `https://github.com/${repo}/pull/${number}`.toLowerCase()) return url
  }
  return null
}
