import type { Metadata } from "next";
import Dashboard from "@/components/cosmo/Dashboard";

export const metadata: Metadata = {
  title: "COSMO | Live health dashboard",
};

export default function CosmoPage() {
  return <Dashboard />;
}
