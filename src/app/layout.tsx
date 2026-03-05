import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Playstack",
  description: "Track your games, ratings, and PSN trophy progress"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
