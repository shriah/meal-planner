import type { Metadata } from "next";
import { Geist, Geist_Mono, Outfit, Noto_Sans } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { SeedBootstrap } from "@/db/seed";
import { AppNav } from "@/components/plan/AppNav";

const notoSansHeading = Noto_Sans({subsets:['latin'],variable:'--font-heading'});

const outfit = Outfit({subsets:['latin'],variable:'--font-sans'});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Food Planner",
  description: "Indian weekly meal planner",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={cn("h-full", "antialiased", geistSans.variable, geistMono.variable, "font-sans", outfit.variable, notoSansHeading.variable)}
    >
      <body className="min-h-full flex flex-col">
        <SeedBootstrap>
          <AppNav />
          <main className="flex-1">
            {children}
          </main>
        </SeedBootstrap>
      </body>
    </html>
  );
}
