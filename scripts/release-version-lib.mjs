// release-version-lib.mjs — pure checks used by check-release-version.mjs (and its tests).

/** The exact artifact file names a release of `version` produces. */
export function expectedArtifactNames(version) {
  return [
    `MyBuildy-Setup-${version}.exe`,
    `MyBuildy-${version}-arm64.dmg`,
    `MyBuildy-${version}-x64.dmg`,
  ]
}

/**
 * Problems with the installer files found in dist/: each must be EXACTLY one of
 * the expected names (no prefix/substring matching), and there must be at least one.
 */
export function artifactProblems(version, names) {
  const expected = new Set(expectedArtifactNames(version))
  const problems = []
  if (names.length === 0) problems.push('no installer files found under dist/')
  for (const name of names) {
    if (!expected.has(name)) problems.push(`artifact ${name} is not an exact ${version} release file name`)
  }
  return problems
}
