import type { Metadata } from "next";
import "./admin.css";

export const metadata: Metadata = {
  title: "Administração | Blox Rank BR",
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className="admin-body">{children}</div>;
}
