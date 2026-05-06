import type { Metadata, Viewport } from "next";
import { DM_Sans, Outfit, Poppins } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthGuard } from "@/components/auth-guard";
import { AppShell } from "@/components/app-shell";
import { Toaster } from "sonner";
import "flexlayout-react/style/light.css";
import "tippy.js/dist/tippy.css";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  title: "Agent Spaces",
  description: "Multi-agent collaborative coding workspace",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className={`${dmSans.variable} ${outfit.variable} ${poppins.variable} h-dvh overflow-hidden antialiased`}
      suppressHydrationWarning
    >
      <body className="h-full overflow-hidden font-sans">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <AuthGuard>
            <AppShell>{children}</AppShell>
            <Toaster richColors position="bottom-right" />
          </AuthGuard>
        </ThemeProvider>
      </body>
    </html>
  );
}
