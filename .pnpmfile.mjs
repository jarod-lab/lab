// openapi-typescript (the sdk's schema generator) calls TypeScript's JS compiler API, which
// TypeScript 7 does not ship. Its TypeScript peer would resolve to the workspace's 7, so it gets its
// own TypeScript 5 as a regular dependency instead.
function readPackage(pkg) {
  if (pkg.name === "openapi-typescript") {
    delete pkg.peerDependencies?.typescript
    pkg.dependencies = { ...pkg.dependencies, typescript: "^5.9.3" }
  }
  return pkg
}

export const hooks = { readPackage }
