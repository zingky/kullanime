import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";
import { ThemeProvider } from "@/components/ThemeProvider";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: {
    default: "KullAnime - Quản lý & Đánh giá Anime",
    template: "%s | KullAnime",
  },
  description:
    "Trang web quản lý, đánh giá và chia sẻ danh sách Anime cá nhân & cộng đồng.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" className={`${inter.variable} dark`}>
      <body className="min-h-screen bg-white font-sans antialiased transition-colors duration-300 dark:bg-dark-950">
        <ThemeProvider>
          <Navbar />
          <main>{children}</main>
          <footer className="mt-auto border-t border-dark-100 py-8 dark:border-dark-800 dark:bg-dark-900/80">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
              <p className="text-center text-xs text-gray-500">
                © {new Date().getFullYear()} KullAnime - Đồng hành cùng cộng đồng anime Việt Nam
              </p>
            </div>
          </footer>
        </ThemeProvider>
      </body>
    </html>
  );
}