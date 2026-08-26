import type { Metadata, Viewport } from "next";
import { ThemeProvider } from "@/components/layout/theme-provider";
import { LocaleProvider } from "@/components/layout/locale-provider";
import { AuthGuard } from "@/components/layout/auth-guard";
import { AppShell } from "@/components/layout/app-shell";
import { ConsolePanel } from "@/components/common/console-panel";
import { DevInspector } from "@/components/layout/dev-inspector";
import { ProcmLoggerInit } from "@/components/layout/procm-logger-init";
import { ViewportInsets } from "@/components/layout/viewport-insets";
import { CommandPalette } from "@/components/layout/command-palette";
import { ThemeStyleInit } from "@/components/layout/theme-style-init";
import { Toaster } from "sonner";
import "flexlayout-react/style/light.css";
import "tippy.js/dist/tippy.css";
import "./globals.css";
import { Inter, Geist_Mono } from "next/font/google";
import { cn } from "@/lib/utils";

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

const interHeading = Inter({
  subsets: ["latin"],
  variable: "--font-heading",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "Agent Spaces",
  description: "Multi-agent collaborative coding workspace",
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang=""
      className={cn(
        "h-[var(--app-content-height)] overflow-hidden antialiased font-sans",
        inter.variable,
        interHeading.variable,
        geistMono.variable,
      )}
      suppressHydrationWarning
    >
      <head />
      <body className="h-[var(--app-content-height)] overflow-hidden font-sans">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <ThemeStyleInit />
          <ProcmLoggerInit />
          <LocaleProvider>
            <ViewportInsets />
            <AuthGuard>
              <DevInspector />
              <AppShell>{children}</AppShell>
              <CommandPalette />
              <Toaster richColors position="bottom-right" />
            </AuthGuard>
            <ConsolePanel />
          </LocaleProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
