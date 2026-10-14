import type { Metadata } from "next";
import "./globals.css";

const APP_NAME = "Kress";
const description =
  "Robotic mower quoting tools: measure a golf course's turf acreage (fairways, greens, tees and rough) and estimate grant and tax savings in Quebec and Ontario.";

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="h-full">{children}</body>
    </html>
  );
}
