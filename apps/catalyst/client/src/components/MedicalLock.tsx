/** Shown instead of medical content whenever the user lacks the specific explicit permission —
 * never shown as a silent empty list, so the reason access is missing is always visible. Role is
 * never enough here, not even Super Admin — see requireMedicalPermission() server-side. */
export function MedicalLock({ action = "view" }: { action?: "view" | "edit" | "export" }) {
  return (
    <div className="sg-medical-lock">
      Medical notes are restricted. You do not have the explicit <code>{action}_medical_notes</code>{" "}
      permission for this record — this is independent of your role, including Super Admin.
    </div>
  );
}
