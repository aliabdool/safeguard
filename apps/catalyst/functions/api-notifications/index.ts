import express from "express";

import { withAuthContext, type SafeGuardRequest } from "../shared/middleware/require-permission";
import {
  checkCapaDueSoon,
  checkCapaOverdue,
  checkCapaVerificationPending,
  checkDocumentExpired,
  checkDocumentExpiringSoon,
  type NotificationCandidate,
} from "../shared/pure/notification-rules";

const app = express();
app.use(express.json());
app.use(withAuthContext);

/** GET /notifications — the current user's own notifications, most recent first. */
app.get("/notifications", async (req, res) => {
  const safeReq = req as unknown as SafeGuardRequest;
  const rows = await safeReq.catalystApp.datastore().table("Notifications").getRows({
    criteria: `Notifications.recipient_user_id == '${safeReq.authContext.userId}'`,
  });
  res.json(rows);
});

app.post("/notifications/:id/read", async (req, res) => {
  const safeReq = req as unknown as SafeGuardRequest;
  await safeReq.catalystApp.datastore().table("Notifications").updateRow({
    ROWID: req.params.id,
    read_at: new Date().toISOString(),
  });
  res.json({ ok: true });
});

/**
 * POST /notifications/scan — runs the five due-date/expiry-driven triggers (CAPA due soon/
 * overdue/verification pending, document expiring/expired) against live scoped records and
 * writes a Notifications row for each newly-detected condition. Callable on demand today; wiring
 * it to a Catalyst Cron schedule (Console → Cron → point at this endpoint, or convert to a
 * dedicated Cron-type Function) is a post-deployment configuration step in your own Zoho project
 * — the same "only you can do this part" pattern as `catalyst init`. The remaining nine
 * event-driven triggers (assigned/created/reported) fire from the relevant service function at
 * the moment of the event itself, not from this periodic scan — see the migration plan doc.
 */
app.post("/notifications/scan", async (req, res) => {
  const safeReq = req as unknown as SafeGuardRequest;
  const datastore = safeReq.catalystApp.datastore();
  const zcql = safeReq.catalystApp.zcql();
  const asOf = new Date();
  const candidates: NotificationCandidate[] = [];

  const capaRows = (await zcql.executeZCQLQuery(
    `select CAPA.ROWID, CAPA.property_id, CAPA.owner_id, CAPA.verifier_id, CAPA.due_date, CAPA.status from CAPA where CAPA.status != 'closed'`,
  )) as Array<{ CAPA: { ROWID: string; property_id: string; owner_id: string; verifier_id: string; due_date: string; status: string } }>;
  for (const { CAPA: c } of capaRows) {
    const base = { id: c.ROWID, propertyId: c.property_id, ownerId: c.owner_id, dueDate: c.due_date, status: c.status };
    const dueSoon = checkCapaDueSoon(base, asOf);
    if (dueSoon) candidates.push(dueSoon);
    const overdue = checkCapaOverdue(base, asOf);
    if (overdue) candidates.push(overdue);
    const verificationPending = checkCapaVerificationPending({ id: c.ROWID, propertyId: c.property_id, verifierId: c.verifier_id, status: c.status });
    if (verificationPending) candidates.push(verificationPending);
  }

  const docRows = (await zcql.executeZCQLQuery(
    `select DocumentVersions.ROWID, DocumentVersions.expiry_date, DocumentVersions.uploaded_by, Documents.property_id
     from DocumentVersions left join Documents on DocumentVersions.document_id = Documents.ROWID
     where DocumentVersions.status == 'approved'`,
  )) as Array<{ DocumentVersions: { ROWID: string; expiry_date: string; uploaded_by: string }; Documents: { property_id: string } }>;
  for (const { DocumentVersions: d, Documents: doc } of docRows) {
    const base = { id: d.ROWID, propertyId: doc.property_id || null, ownerId: d.uploaded_by, expiryDate: d.expiry_date || null };
    const expiringSoon = checkDocumentExpiringSoon(base, asOf);
    if (expiringSoon) candidates.push(expiringSoon);
    const expired = checkDocumentExpired(base, asOf);
    if (expired) candidates.push(expired);
  }

  let written = 0;
  for (const c of candidates) {
    const existing = await datastore.table("Notifications").getRows({
      criteria: `Notifications.entity_id == '${c.entityId}' && Notifications.notification_type == '${c.notificationType}' && Notifications.read_at is null`,
      maxRows: 1,
    });
    if (existing.length > 0) continue; // don't duplicate an unread notification for the same condition
    await datastore.table("Notifications").insertRow({
      recipient_user_id: c.recipientUserId,
      notification_type: c.notificationType,
      message: c.message,
      entity_type: c.entityType,
      entity_id: c.entityId,
      property_id: c.propertyId,
      severity: c.severity,
    });
    written += 1;
  }

  res.json({ scanned: candidates.length, written });
});

module.exports = app;
