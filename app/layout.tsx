import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Smile Storm — 表情驱动 AR 互动实验",
  description: "一个完全运行在浏览器本地的表情 AR 实验。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
