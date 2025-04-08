import "@/app/globals.css";

import { Metadata, Viewport } from "next";
import localFont from "next/font/local";

import { siteConfig } from "@/config/site";
import { Header } from "@/components/header";
import { cn } from "@/lib/utils";
import { ContextProvider } from "@/components/context-provider";
import { headers } from "next/headers";
import { LoginXnode } from "@/components/xnode/login";

// Use local copy to avoid having NextJS fetch the file on the Internet during build time
const font = localFont({
  src: "./AeonikFono-Regular.otf",
});

export const metadata: Metadata = {
  title: {
    default: siteConfig.name,
    template: `%s - ${siteConfig.name}`,
  },
  description: siteConfig.description,
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
    apple: "/icon.svg",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "white" },
    { media: "(prefers-color-scheme: dark)", color: "black" },
  ],
};

interface RootLayoutProps {
  children: React.ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  const cookies = headers().get("cookie");

  return (
    <>
      <html>
        <head />
        <body
          className={cn(
            "min-h-screen antialiased bg-[#CEFF1A] bg-[url(/background.png)] bg-center bg-cover",
            font.className
          )}
        >
          <Header />
          <ContextProvider cookies={cookies}>
            <div className="m-2">{children}</div>
            <LoginXnode />
          </ContextProvider>
        </body>
      </html>
    </>
  );
}
