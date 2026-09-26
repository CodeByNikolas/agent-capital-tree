import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Agent Capital Tree — Delegated capital",
  description:
    "A clear view of delegated capital, permissions, positions and activity.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
