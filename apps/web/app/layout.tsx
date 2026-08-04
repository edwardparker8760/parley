import type { Metadata } from "next";
import { Red_Hat_Display } from "next/font/google";
import "./base.css";

/*
 * Self-hosted at build time, so both routes render correctly with no network at
 * all. That matters more for /app than for /: the dashboard is the demo, and it
 * has to survive being shown on conference wifi.
 */
const redHatDisplay = Red_Hat_Display({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-red-hat-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Parley: agents that negotiate the price",
  description:
    "Two agents haggle over bulk inference capacity inside limits their owners set. The limits are arithmetic, not instructions, so no prompt can talk an agent past them.",
};

export default function RootLayout(props: { children: React.ReactNode }) {
  return (
    /*
     * `no-js` is removed by the first reveal component that mounts, on the
     * landing route. Until then the stylesheet keeps revealed sections visible,
     * so a failed script means no animation rather than a blank page. The
     * dashboard has no reveals and is unaffected.
     */
    <html lang="en" className={`${redHatDisplay.variable} no-js`}>
      <body>{props.children}</body>
    </html>
  );
}
