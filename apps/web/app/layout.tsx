import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Thiên Long · Sự kiện", template: "%s · Thiên Long" },
  description: "Cổng xác nhận tham dự và đón tiếp sự kiện Thiên Long.",
  robots: { index: false, follow: false },
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="vi"><body>{children}</body></html>;
}
