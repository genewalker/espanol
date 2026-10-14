import "server-only";
import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { redirect } from "next/navigation";
import { api } from "../../convex/_generated/api";
import { isUnauthenticated } from "./auth-error";

export async function guardian() {
  if (!process.env.NEXT_PUBLIC_CONVEX_URL) redirect("/sign-in");
  const token = await convexAuthNextjsToken();
  if (!token) redirect("/sign-in");
  const viewer = await fetchQuery(api.users.guardianViewer, {}, { token }).catch((error: unknown) => {
    if (isUnauthenticated(error)) redirect("/sign-in");
    throw error;
  });
  return { viewer, token };
}
