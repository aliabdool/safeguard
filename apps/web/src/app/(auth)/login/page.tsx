import Link from "next/link";

import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <div className="flex flex-col gap-6">
      <LoginForm />
      <p className="text-muted-foreground text-center text-sm">
        No account yet?{" "}
        <Link href="/register" className="underline underline-offset-4">
          Register
        </Link>
      </p>
    </div>
  );
}
