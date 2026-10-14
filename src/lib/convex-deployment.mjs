/**
 * Match a canonical Convex cloud origin to its deployment name, with or
 * without a region label. Shared by operator scripts and the backend guard.
 * @param {string | undefined} name
 * @param {string | undefined} value
 */
export function matchesConvexDeployment(name, value) {
  if (!name || !value) return false;
  try {
    const url = new URL(value);
    const host = /^([a-z0-9]+(?:-[a-z0-9]+)+)(?:\.[a-z]{2}(?:-[a-z]+)+-[0-9]+)?\.convex\.cloud$/.exec(url.hostname);
    return url.protocol === "https:" && url.origin === value && host?.[1] === name;
  } catch {
    return false;
  }
}
