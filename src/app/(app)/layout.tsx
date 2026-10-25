import BootSplash from "@/components/BootSplash";
import "../boot.css";

/** The app itself boots behind its splash; a client's proposal page (/p/…) doesn't. */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <BootSplash />
      {children}
    </>
  );
}
