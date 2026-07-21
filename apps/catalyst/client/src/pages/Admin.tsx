import { Row } from "../components/Row";

/**
 * Admin screens. User/role/permission management and property/department master-data editing are
 * deliberately NOT reimplemented here as a parallel UI — Catalyst's own Console already provides
 * this over the Users/Roles/UserPermissions/Properties/Departments tables (Console → Data Store /
 * Authentication), and duplicating that as bespoke screens without also duplicating its
 * validation would be worse than pointing at the real thing. These pages document what to do in
 * the Console rather than pretending a feature exists that isn't wired up yet.
 */
export function AdminUsers() {
  return (
    <div>
      <h1>Users &amp; Permissions</h1>
      <Row title="Manage in the Catalyst Console">
        <div className="sg-empty">
          User approval, role assignment (UserRoles), property/department access grants
          (UserPropertyAccess / UserDepartmentAccess), and the three explicit medical permissions
          (UserPermissions) are managed directly in the Catalyst Console today — Console →
          Authentication for user accounts, Console → Data Store for the grant tables. A dedicated
          in-app admin workflow is tracked as follow-on work once the Console-based path is
          validated by management.
        </div>
      </Row>
    </div>
  );
}

export function AdminProperties() {
  return (
    <div>
      <h1>Properties &amp; Departments</h1>
      <Row title="Manage in the Catalyst Console">
        <div className="sg-empty">
          The five seeded properties and nineteen departments (data-store-schema/02-master-data.json)
          are edited via Console → Data Store → Properties / Departments today. This screen is a
          placeholder for a future in-app editor, not a claim that one exists yet.
        </div>
      </Row>
    </div>
  );
}

export function AdminSettings() {
  return (
    <div>
      <h1>Settings</h1>
      <Row title="System">
        <div className="sg-empty">
          Framework/KPI definitions live in Data Store (KPIDefinitions, Frameworks,
          FrameworkRequirements) and are edited via Console today. Notification delivery
          (email/SMS provider) is configured per environment variables on the notifications
          Function once you choose a provider — see apps/catalyst/README.md.
        </div>
      </Row>
    </div>
  );
}
