import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "k8s-auth-sidecar Demo",
  description: "Frontend + Backend + Sidecar Authorization Demo",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
