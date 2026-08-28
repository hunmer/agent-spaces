import type { Metadata, Viewport } from "next";
import { ThemeProvider } from "@/components/layout/theme-provider";
import { LocaleProvider } from "@/components/layout/locale-provider";
import { AuthGuard } from "@/components/layout/auth-guard";
import { AppShell } from "@/components/layout/app-shell";
import { DeferredLayoutFeatures } from "@/components/layout/deferred-layout-features";
import { ViewportInsets } from "@/components/layout/viewport-insets";
import { ThemeStyleInit } from "@/components/layout/theme-style-init";
import { Toaster } from "sonner";
import "flexlayout-react/style/light.css";
import "tippy.js/dist/tippy.css";
import "./globals.css";

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
      className="h-[var(--app-content-height)] overflow-hidden antialiased font-sans"
      suppressHydrationWarning
    >
      <head />
      <body className="h-[var(--app-content-height)] overflow-hidden font-sans">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <ThemeStyleInit />
          <LocaleProvider>
            <ViewportInsets />
            <AuthGuard>
              <AppShell>{children}</AppShell>
              <Toaster richColors position="bottom-right" />
            </AuthGuard>
            <DeferredLayoutFeatures />
          </LocaleProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
