import { desc, eq } from "drizzle-orm";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDb } from "@/db";
import { notifications, profiles } from "@/db/schema";
import { getAuthContext } from "@/server/permissions";

import { MarkReadForm } from "./mark-read-form";

export default async function AccountPage() {
  const ctx = await getAuthContext();
  if (!ctx) {
    return null;
  }
  const db = getDb();

  const [[profile], myNotifications] = await Promise.all([
    db.select().from(profiles).where(eq(profiles.id, ctx.userId)),
    db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, ctx.userId))
      .orderBy(desc(notifications.createdAt))
      .limit(50),
  ]);

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Account</h1>
        <p className="text-muted-foreground text-sm">{profile?.fullName}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Roles &amp; access</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <p>Roles: {ctx.roleCodes.join(", ") || "none"}</p>
          <p>Properties granted: {ctx.propertyIds.length}</p>
          <p>
            Medical-data permission: {ctx.hasMedicalPermission ? "Granted" : "Not granted"}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Notifications</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {myNotifications.length === 0 ? (
            <p className="text-muted-foreground text-sm">No notifications.</p>
          ) : (
            myNotifications.map((n) => (
              <div
                key={n.id}
                className="flex items-start justify-between gap-3 rounded-md border p-3 text-sm"
              >
                <div>
                  <p className="font-medium">
                    {n.title} {n.readAt ? null : <Badge variant="warning">new</Badge>}
                  </p>
                  <p className="text-muted-foreground">{n.body}</p>
                  <p className="text-muted-foreground text-xs">
                    {new Date(n.createdAt).toLocaleString()}
                  </p>
                </div>
                {!n.readAt ? <MarkReadForm notificationId={n.id} /> : null}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
