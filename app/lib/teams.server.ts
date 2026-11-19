// Team-membership helpers shared by the routes that ask "is this person a
// Team Admin?" — settings (which categories the preference card shows),
// the DevUI switch-user guard (which pages the switched-to user can see),
// and any future route that gates on team administration.
import { and, eq } from "drizzle-orm";
import { db } from "~/db";
import { TeamMemberRole, teamMembers } from "~/db/schema";

export function isTeamAdmin(userId: number) {
  return (
    db
      .select()
      .from(teamMembers)
      .where(
        and(
          eq(teamMembers.userId, userId),
          eq(teamMembers.role, TeamMemberRole.Admin)
        )
      )
      .get() !== undefined
  );
}
