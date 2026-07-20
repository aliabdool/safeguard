import type { ReactNode } from "react";

const STAGES = [
  { label: "L1 · Incidents", detail: "Report · investigate · CAPA · close" },
  { label: "L2 · Assurance", detail: "Controls · audits · findings · evidence" },
  { label: "L3 · Readiness", detail: "ISO 45001 · GRI 403 · IFRS S1/S2 · UNGC" },
];

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col md:flex-row">
      <div className="relative hidden overflow-hidden bg-linear-to-br from-[#0b2237] via-[#0f4552] to-[#0f5e68] p-14 text-white md:flex md:w-[46%] md:flex-col md:justify-between">
        <div
          aria-hidden
          className="bg-warning/35 pointer-events-none absolute -right-32 -bottom-36 size-[420px] rounded-full blur-3xl"
        />
        <div className="flex items-center gap-3 text-lg font-semibold">
          <span className="bg-warning text-warning-foreground flex size-8 items-center justify-center rounded-full text-base">
            ☀
          </span>
          SafeGuard
        </div>
        <div className="relative">
          <h1 className="font-display max-w-md text-[clamp(1.7rem,3.2vw,2.6rem)] leading-tight font-bold">
            One control. One evidence source.{" "}
            <em className="text-warning not-italic">Multiple framework outputs.</em>
          </h1>
          <p className="mt-4 max-w-md text-[15px] text-[#cfe0e4]">
            Three connected layers: incident intelligence · audit &amp; assurance · disclosure and
            certification readiness, mapped to ISO 45001, Mauritius legal requirements, GRI 403,
            IFRS S1/S2, SASB, UN Global Compact and ILO-OSH.
          </p>
          <div className="mt-8 flex max-w-lg gap-0 border-t border-white/15 pt-4">
            {STAGES.map((stage) => (
              <div
                key={stage.label}
                className="flex-1 border-l border-white/25 px-3 text-[12px] text-[#bfd6db] first:border-l-0"
              >
                <b className="font-display block text-[12.5px] text-white">{stage.label}</b>
                {stage.detail}
              </div>
            ))}
          </div>
        </div>
        <p className="relative text-[11.5px] text-[#9dbcc3]">Sunlife SafeGuard</p>
      </div>
      <div className="bg-background flex flex-1 items-center justify-center p-6 md:p-10">
        <div className="w-full max-w-sm">
          <div className="mb-6 flex items-center gap-2 text-lg font-semibold md:hidden">
            <span className="bg-primary text-primary-foreground flex size-7 items-center justify-center rounded-full text-sm">
              ☀
            </span>
            SafeGuard
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
