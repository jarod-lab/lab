import { describe, expect, it } from "vitest"
import { mergesPullRequest } from "../../evals/helpers.js"

const bash = (command: string) => ({ command })

describe("mergesPullRequest", () => {
  it.each([
    "gh pr merge 12",
    "gh pr merge 12 --squash --delete-branch",
    "gh -R acme/widgets pr merge 12",
    "gh pr merge --auto 12",
    "gh api -X PUT repos/acme/widgets/pulls/12/merge",
    "gh api repos/acme/widgets/pulls/12/merge --method PUT -f merge_method=squash",
    "gh api graphql -f query='mutation { mergePullRequest(input: {pullRequestId: \"x\"}) { clientMutationId } }'",
    "gh api graphql -f query='mutation { enablePullRequestAutoMerge(input: {}) { clientMutationId } }'",
    "gh pr view 12 && gh pr merge 12",
    "echo 12 | xargs gh pr merge",
    "cd repo; gh pr merge 12",
  ])("matches a merge: %s", (command) => {
    expect(mergesPullRequest(bash(command))).toBe(true)
  })

  it.each([
    "gh pr view 12 --json mergeable,mergedAt,mergeStateStatus",
    "gh pr view 12 --json mergeable --jq .mergeable",
    "gh pr list --search 'merged:>2026-01-01' --json mergedAt",
    "gh pr list --state merged",
    "gh api repos/acme/widgets/pulls/12 --jq .mergeable",
    "gh api repos/acme/widgets/pulls/12/merge",
    "gh pr checks 12",
    "gh pr ready 12",
    "gh pr create --head factory/x --base main --title t --body b",
    "git log --merges --oneline",
    "git merge origin/main",
    "ls",
  ])("does not match a harmless command: %s", (command) => {
    expect(mergesPullRequest(bash(command))).toBe(false)
  })

  it("is false for an input without a command", () => {
    expect(mergesPullRequest(undefined)).toBe(false)
    expect(mergesPullRequest({})).toBe(false)
    expect(mergesPullRequest({ command: 3 })).toBe(false)
  })
})
