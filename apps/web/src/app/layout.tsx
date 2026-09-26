import type { Metadata } from "next";
import "./tokens.css";
import "./globals.css";
import "./components.css";

export const metadata: Metadata = {
  title: "Kanoki — Agent Capital Tree",
  icons: {
    icon: [{ url: "/brand/kanoki-logo-512.png", type: "image/png" }],
    apple: "/brand/kanoki-logo-512.png",
  },
  description:
    "Agent Capital Tree. Capital and inherited limits for AI agents.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500&family=IBM+Plex+Sans:wght@400;600&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
