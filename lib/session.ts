import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

/** Returns userId from the current session, or null if unauthenticated. */
export async function getUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  return (session?.user as { id?: string } | undefined)?.id ?? null;
}
