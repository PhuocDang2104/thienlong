import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "45 năm Hành Trình - Viết triệu tương lai | Thiên Long", template: "%s · Thiên Long" },
  description: "Đón khách lúc 17:30 ngày 20/11/2026 tại Gem Center - Sảnh Pollux, Tầng 3.",
  robots: { index: false, follow: false },
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="vi"><body>{children}</body></html>;
}
