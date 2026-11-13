import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { GeistPixelSquare } from "geist/font/pixel";
import "./globals.css";


export const metadata: Metadata = {
  title: "COSMO | Your companion beyond Earth",
  description:
    "COSMO is an offline-first health companion on an astronaut's wrist. It reads wearable and cabin sensors, learns one person's normal, and talks them through approved self-care when Earth is out of reach. This site is a simulation.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable} ${GeistPixelSquare.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
