import type { Metadata } from "next";
import AdminView from "@/components/AdminView";

export const metadata: Metadata = { title: "Calculator · team", robots: { index: false, follow: false } };

export default function AdminPage() {
  return <AdminView />;
}
