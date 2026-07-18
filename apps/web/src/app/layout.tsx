import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
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
