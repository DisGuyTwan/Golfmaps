import type { Metadata, Viewport } from "next";
import BootSplash from "@/components/BootSplash";
import { PREFERENCES_BOOT_SCRIPT } from "@/lib/preferences-boot";
import "./globals.css";
import "./boot.css";

const APP_NAME = "Calculator";
const description =
  "Robotic mower quoting tools: measure a golf course's turf, a sod farm's fields or a residential lawn, find the Kress model that fits it, plan a crew's grass run, estimate grant and tax savings in Quebec and Ontario, and compare Kress robots with a zero-turn crew.";

export const metadata: Metadata = {
  title: APP_NAME,
  description,
  applicationName: APP_NAME,
  // Link previews were bare before this: no title, description or type, so a
  // shared link rendered as a naked URL.
  openGraph: {
    title: APP_NAME,
    description,
    type: "website",
  },
  twitter: {
    card: "summary",
    title: APP_NAME,
    description,
  },
};

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#181f1c" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // The boot script may add `dark` / change `lang` before React hydrates.
    <html lang="en-CA" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: PREFERENCES_BOOT_SCRIPT }} />
      </head>
      <body className="h-full">
        <BootSplash />
        {children}
      </body>
    </html>
  );
}
