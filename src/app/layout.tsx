import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Quote desk", template: "%s · Quote desk" },
  description: "RFQ-to-quote costing for Company A",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN">
      <body className="min-h-dvh bg-surface text-ink">{children}</body>
    </html>
  );
}
