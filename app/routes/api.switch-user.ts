import { redirect } from "react-router";
import { z } from "zod";
import { eq } from "drizzle-orm";
import type { Route } from "./+types/api.switch-user";
import { db } from "~/db";
import { UserRole, users } from "~/db/schema";
import { setCurrentUserId } from "~/lib/session";
import { parseFormData } from "~/lib/validation";
import { isTeamAdmin } from "~/lib/teams.server";

const switchUserSchema = z.object({
  userId: z.coerce.number().int().positive("Invalid user ID"),
});

/**
 * Whether the freshly switched user can actually see the page the DevUI is
 * about to land them on. The panel redirects back to the current path, so
 * switching away from a role-restricted page used to bounce the new user
 * straight into a 403.
 */
function canViewPath(path: string, role: UserRole, isTeamAdmin: boolean) {
  const pathname = path.split("?")[0] ?? "/";
  if (pathname === "/instructor") return role === UserRole.Instructor;
  if (pathname.startsWith("/instructor/")) {
    return role === UserRole.Instructor || role === UserRole.Admin;
  }
  if (pathname.startsWith("/admin")) return role === UserRole.Admin;
  if (pathname === "/team") return isTeamAdmin;
  return true;
}

export async function action({ request, url }: Route.ActionArgs) {
  const formData = await request.formData();
  const parsed = parseFormData(formData, switchUserSchema);

  if (!parsed.success) {
    throw new Response("Invalid user ID", { status: 400 });
  }

  const cookie = await setCurrentUserId(request, parsed.data.userId);

  const redirectTo = url.searchParams.get("redirectTo") ?? "/";
  const user = db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, parsed.data.userId))
    .get();
  const teamAdmin = isTeamAdmin(parsed.data.userId);

  // Switching users while parked on a role-restricted page (e.g. testing
  // notifications as the instructor, then switching to a student) used to
  // redirect straight into a 403. Land somewhere the new user can see.
  if (user && !canViewPath(redirectTo, user.role, teamAdmin)) {
    return redirect("/", { headers: { "Set-Cookie": cookie } });
  }

  return redirect(redirectTo, { headers: { "Set-Cookie": cookie } });
}
