"use client";

import dynamic from "next/dynamic";

// SkyOffice 使用 Phaser 3，强依赖 window/document，必须客户端加载。
// 用 dynamic + ssr:false 包裹，避免 Next.js SSR 阶段访问浏览器 API。
const SkyOfficeApp = dynamic(
  () => import("@/features/skyoffice/SkyOfficeApp").then((m) => m.SkyOfficeApp),
  { ssr: false, loading: () => <div className="flex h-screen items-center justify-center bg-[#93cbee] text-gray-700">Loading SkyOffice…</div> }
);

export default function Page() {
  return <SkyOfficeApp />;
}
