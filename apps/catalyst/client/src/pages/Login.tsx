import { useAuth } from "../lib/auth";

/**
 * Login / role-based access test screen. Real sign-in happens through Zoho Catalyst's own
 * Embedded Authentication (hosted login page + session cookie) — this screen does not
 * reimplement a credential form; it hands off to the project's real login URL, which only exists
 * once you've enabled Authentication in the Catalyst Console and this client's config.json points
 * at your project. See README.md "Post-deployment configuration".
 */
export function Login() {
  const { loginUrl, offline } = useAuth();
  return (
    <div className="sg-login-screen">
      <div className="sg-login-card">
        <h1 style={{ marginBottom: 4 }}>Sunlife SafeGuard</h1>
        <p className="sg-card-sub" style={{ marginBottom: 20 }}>Health &amp; Safety Assurance Platform</p>
        {offline ? (
          <p className="sg-card-sub">
            Not connected to a live backend yet. Once Package A (Functions) and Authentication are
            deployed to your Zoho Catalyst project, edit <code>config.json</code> with the real
            values and reload.
          </p>
        ) : (
          <a className="sg-btn" href={loginUrl} style={{ width: "100%", justifyContent: "center" }}>
            Sign in with Catalyst
          </a>
        )}
      </div>
    </div>
  );
}
