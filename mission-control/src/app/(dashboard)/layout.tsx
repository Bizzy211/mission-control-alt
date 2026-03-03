import type { Metadata } from "next";
import { LayoutShell } from "@/components/layout-shell";

export const metadata: Metadata = {
  title: "Mission Control",
  description: "The command center for humans supervising AI agents",
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <LayoutShell>{children}</LayoutShell>;
}
