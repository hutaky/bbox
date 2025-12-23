// src/app/layout.tsx
import "../styles/globals.css";
import type { ReactNode } from "react";
import Providers from "./providers";

export const metadata = {
  title: "BBOX | Daily Based Box Game",
  description: "Open your BBOX daily, earn points, climb the leaderboard.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-black text-white">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
