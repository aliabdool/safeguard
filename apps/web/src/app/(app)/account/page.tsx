import { headers } from "next/headers";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { catalystAppFromHeaders, type CatalystRow } from "@/lib/catalyst/app";
import { getAuthContext } from "@/server/permissions";

import { MarkReadForm } from "./mark-read-form";

interface NotificationRow {
  ROWID: string;
  title: string;
  message: string | null;
  read_at: string | null;
  created_at: string;
}

export default async function AccountPage() {
  const ctx = await getAuthContext();
  if (!ctx) {
    return null;
  }

  const catalystApp = catalystAppFromHeaders(await headers());
  const datastore = catalystApp.datastore();

  const [profileRows, notificationRows] = await Promise.all([
    datastore
      .table("Users")
      .getRows({ criteria: `Users.ROWID == '${ctx.userId}'`, maxRows: 1 }),
    catalystApp.zcql().executeZCQLQuery(
      `select Notifications.ROWID, Notifications.title, Notifications.message, Notifications.read_at, Notifications.created_at from Notifications where Notifications.recipient_user_id == '${ctx.userId}' order by Notifications.created_at desc limit 50`,
    ),
  ]);

  const profile = profileRows[0] as (CatalystRow & { full_name: string }) | undefined;
  const myNotifications = (
    notificationRows as Array<{ Notifications: NotificationRow }>
  ).map((r) => r.Notifications);

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Account</h1>
        <p className="text-muted-foreground text-sm">{profile?.full_name}</p>
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
                key={n.ROWID}
                className="flex items-start justify-between gap-3 rounded-md border p-3 text-sm"
              >
                <div>
                  <p className="font-medium">
                    {n.title} {n.read_at ? null : <Badge variant="warning">new</Badge>}
                  </p>
                  <p className="text-muted-foreground">{n.message}</p>
                  <p className="text-muted-foreground text-xs">
                    {new Date(n.created_at).toLocaleString()}
                  </p>
                </div>
                {!n.read_at ? <MarkReadForm notificationId={n.ROWID} /> : null}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
