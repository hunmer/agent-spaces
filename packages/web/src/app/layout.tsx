import type { Metadata } from "next";
import { DM_Sans, Outfit, Poppins } from "next/font/google";
import { DevInspector } from "@/components/dev-inspector";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { DashboardSidebar } from "@/components/sidebar/app-sidebar";
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
      className={`${dmSans.variable} ${outfit.variable} ${poppins.variable} h-full antialiased`}
    >
      <body className="min-h-full font-sans">
        <DevInspector />
        <SidebarProvider>
          <DashboardSidebar />
          <SidebarInset>
            {children}
          </SidebarInset>
        </SidebarProvider>
      </body>
    </html>
  );
}
