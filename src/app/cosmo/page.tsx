import type { Metadata } from "next";
import Experience from "@/components/Experience";

export const metadata: Metadata = {
  title: "COSMO | Health monitor",
};

export default function CosmoPage() {
  return <Experience initial="device" />;
}
