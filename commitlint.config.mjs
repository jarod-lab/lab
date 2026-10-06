export default {
  extends: ["@commitlint/config-conventional"],
  // Dependabot writes "Bump x from a to b" (sentence case) and long bodies; skip bot commits.
  ignores: [(message) => message.includes("Signed-off-by: dependabot[bot]")],
}
