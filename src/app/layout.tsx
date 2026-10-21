import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "GD Singh PMS",
  description: "Internal practice management for GD Singh & Associates"
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
