import type { Metadata } from "next";
import { Red_Hat_Display } from "next/font/google";
import "./globals.css";

/*
 * Self-hosted at build time, so the dashboard renders correctly with no network
 * at all. That matters here more than on the landing page: this screen is the
 * demo, and it has to survive being run on a conference wifi connection.
 */
const redHatDisplay = Red_Hat_Display({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-red-hat-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Parley",
  description: "Negotiating agents with hard guardrails, settling on Arc",
};

export default function RootLayout(props: { children: React.ReactNode }) {
  return (
    <html lang="en" className={redHatDisplay.variable}>
      <body>{props.children}</body>
    </html>
  );
}
