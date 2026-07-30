import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Golf Course Acreage Calculator",
  description:
    "Measure a golf course's turf acreage from OpenStreetMap — fairways, greens, tees and rough, net of trees, buildings and parking — for robotic mower quoting.",
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
