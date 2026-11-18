import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AppProviders } from "@/providers/app-providers";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

/**
 * The demo is a client-side app: all data lives in localStorage, so there is no server data to
 * stream and instant-navigation validation does not apply.
 */
export const instant = false;

export const metadata: Metadata = {
  title: "MTS ITT Operations | Techneura Labs",
  icons: { icon: "/mts-logo.jpg", apple: "/mts-logo.jpg" },
  description:
    "Inter-Terminal Transport (ITT) Operations Management System – interactive demo for Marine Transport Services (Pvt) Ltd.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
