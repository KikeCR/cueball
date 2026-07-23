import type { ReactNode } from "react";
import "../styles/shared.css";

export const metadata = {
  title: "CueBall",
  description: "Shared watch-party queue for YouTube",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
