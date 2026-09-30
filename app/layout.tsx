import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "OneMinute Analyzer — Ship with a world of confidence",
  description:
    "Test your release from around the world. Real browsers, real locations, clear answers.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
