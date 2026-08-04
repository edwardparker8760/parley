import type { Metadata } from "next";
import { Red_Hat_Display } from "next/font/google";
import "./globals.css";

/*
 * Self-hosted at build time by next/font, so the page needs no network at
 * runtime and there is no flash of a fallback face. Weight 500 is the heading
 * weight for this design; 400 carries body copy.
 */
const redHatDisplay = Red_Hat_Display({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
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
     * `no-js` is removed by the first reveal component that mounts. Until then
     * the stylesheet keeps every revealed section visible, so a failed script
     * means no animation rather than a blank page.
     */
    <html lang="en" className={`${redHatDisplay.variable} no-js`}>
      <body>{props.children}</body>
    </html>
  );
}
