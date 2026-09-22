import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Newsfeed Video Studio",
  description: "A Next.js app powered by Remotion",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
