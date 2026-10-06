import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PrimeFit 50+",
  description: "Safe strength, nutrition, progress, and AI coaching for adults 50+."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
