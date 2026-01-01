// src/app/layout.tsx
import "../styles/globals.css";
import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "BBOX – Daily Based Box Game",
  description: "Open daily boxes, earn points, climb the leaderboard.",
  openGraph: {
    title: "BBOX – Daily Based Box Game",
    description: "Open daily boxes · Earn points · Become OG",
    images: [
      {
        url: "https://box-sage.vercel.app/og.png",
        width: 1200,
        height: 630,
      },
    ],
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
        />
      </head>
      <body className="min-h-screen bg-black text-white">{children}</body>
    </html>
  );
}
