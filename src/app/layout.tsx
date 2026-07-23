import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Golf Course Acreage Calculator",
  description:
    "Draw a bounding box over a golf course to fetch fairway polygons from OpenStreetMap and calculate total acreage for robotic mower quoting.",
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
