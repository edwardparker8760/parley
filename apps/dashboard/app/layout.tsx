import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Parley",
  description: "Negotiating agents with hard guardrails, settling on Arc",
};

export default function RootLayout(props: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{props.children}</body>
    </html>
  );
}
