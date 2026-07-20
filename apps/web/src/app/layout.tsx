import type { Metadata } from "next";
import { Inter, Sora } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
});

export const metadata: Metadata = {
  title: "Sunlife SafeGuard",
  description: "Health & Safety management assurance system for Sunlife properties.",
};

const isDemoEnvironment = process.env.NEXT_PUBLIC_APP_ENV === "demo";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${sora.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        {isDemoEnvironment ? (
          <div className="bg-warning text-warning-foreground px-4 py-2 text-center text-sm font-medium">
            Demonstration environment — do not enter real personal, medical or confidential
            information.
          </div>
        ) : null}
        {children}
      </body>
    </html>
  );
}
