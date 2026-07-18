import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="bg-muted/30 flex min-h-svh flex-col items-center justify-center gap-6 p-6">
      <div className="flex items-center gap-2 text-lg font-semibold">
        <span className="bg-primary text-primary-foreground rounded-md px-2 py-1 text-sm">
          SG
        </span>
        Sunlife SafeGuard
      </div>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
