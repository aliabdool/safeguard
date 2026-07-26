import { NavLink } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { NAV_SECTIONS, isNavItemVisible } from "../lib/nav";

export function Layout({ children }: { children: React.ReactNode }) {
  const { me, offline } = useAuth();
  const roles = me?.roleCodes ?? [];

  return (
    <div className="sg-app">
      <aside className="sg-sidebar">
        <div className="sg-sidebar-brand">
          Sunlife SafeGuard
          <small>Health &amp; Safety Assurance</small>
        </div>
        <nav>
          {NAV_SECTIONS.map((section) => {
            const visible = section.items.filter((i) => isNavItemVisible(i, roles));
            if (visible.length === 0) return null;
            return (
              <div key={section.title}>
                <div className="sg-nav-section">{section.title}</div>
                {visible.map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className={({ isActive }) => `sg-nav-link${isActive ? " active" : ""}`}
                  >
                    {item.label}
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>
      </aside>
      <div className="sg-main">
        <header className="sg-topbar">
          <div />
          <div className="sg-topbar-user">
            {offline ? "Not connected" : me ? `${me.userId} · ${me.roleCodes.join(", ") || "No role assigned"}` : ""}
          </div>
        </header>
        <main className="sg-content">
          {offline && (
            <div className="sg-offline-banner">
              Not connected to a live SafeGuard backend — this is a structural preview only. No
              figures on this screen are real data. Edit <code>config.json</code> after deploying
              Package A (Functions) to point this client at your Zoho Catalyst project.
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
