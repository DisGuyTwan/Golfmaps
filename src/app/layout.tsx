import type { Metadata } from "next";
import "./globals.css";

const description =
  "Measure a golf course's turf acreage from OpenStreetMap — fairways, greens, tees and rough, net of trees, buildings and parking — for robotic mower quoting.";

export const metadata: Metadata = {
  title: "Golf Course Acreage Calculator",
  description,
  applicationName: "Golf Course Acreage Calculator",
  // Link previews were bare before this: no title, description or type, so a
  // shared link rendered as a naked URL.
  openGraph: {
    title: "Golf Course Acreage Calculator",
    description,
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Golf Course Acreage Calculator",
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
