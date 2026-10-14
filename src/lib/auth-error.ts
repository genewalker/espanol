import { ConvexError } from "convex/values";

export function isUnauthenticated(error: unknown): boolean {
  return error instanceof ConvexError && error.data === "UNAUTHENTICATED";
}
