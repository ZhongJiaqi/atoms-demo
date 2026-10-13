import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Atoms Demo · Coding Agent",
  description: "使用自然语言生成、构建并预览真实 React + Vite 应用",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
