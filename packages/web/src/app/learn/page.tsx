"use client";

import { ImageAccordionRow, type AccordionItem } from "@/components/ui/interactive-image-accordion";
import { useTranslations } from "next-intl";

const sections: { id: string; title: string; items: AccordionItem[] }[] = [
  {
    id: "quick-start",
    title: "快速上手",
    items: [
      { id: "qs-1", title: "认识 Agent Spaces", imageUrl: "https://placehold.co/600x800/1f2937/ffffff?text=Agent+Spaces", url: "https://www.example.com/intro" },
      { id: "qs-2", title: "添加 LLM 供应商", imageUrl: "https://placehold.co/600x800/1f2937/ffffff?text=LLM+Provider", url: "https://www.example.com/add-provider" },
      { id: "qs-3", title: "配置 Agent", imageUrl: "https://placehold.co/600x800/1f2937/ffffff?text=Agent", url: "https://www.example.com/configure-agent" },
      { id: "qs-4", title: "Agent Chat", imageUrl: "https://placehold.co/600x800/1f2937/ffffff?text=Chat", url: "https://www.example.com/agent-chat" },
      { id: "qs-5", title: "添加工作区", imageUrl: "https://placehold.co/600x800/1f2937/ffffff?text=Workspace", url: "https://www.example.com/add-workspace" },
    ],
  },
  {
    id: "advanced",
    title: "进阶使用",
    items: [
      { id: "ad-1", title: "工作流", imageUrl: "https://placehold.co/600x800/312e81/ffffff?text=Workflow", url: "https://www.example.com/workflow" },
      { id: "ad-2", title: "团队模式", imageUrl: "https://placehold.co/600x800/312e81/ffffff?text=Team", url: "https://www.example.com/team" },
      { id: "ad-3", title: "MiniApp", imageUrl: "https://placehold.co/600x800/312e81/ffffff?text=MiniApp", url: "https://www.example.com/miniapp" },
      { id: "ad-4", title: "Hook", imageUrl: "https://placehold.co/600x800/312e81/ffffff?text=Hook", url: "https://www.example.com/hook" },
    ],
  },
  {
    id: "for-developers",
    title: "面向开发者",
    items: [
      { id: "fd-1", title: "编写 MiniApp", imageUrl: "https://placehold.co/600x800/065f46/ffffff?text=Build+MiniApp", url: "https://www.example.com/build-miniapp" },
      { id: "fd-2", title: "参与开发", imageUrl: "https://placehold.co/600x800/065f46/ffffff?text=Contribute", url: "https://www.example.com/contribute" },
    ],
  },
];

export default function LearnPage() {
  const t = useTranslations("learn");
  return (
    <div className="h-full overflow-y-auto">
    <div className="container mx-auto px-4 py-12 md:py-16">
      <div className="mb-10 text-center">
        <h1 className="text-4xl md:text-6xl font-bold text-foreground leading-tight tracking-tighter">
          {t("title")}
        </h1>
        <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
          {t("description")}
        </p>
      </div>

      <div className="flex flex-col gap-12">
        {sections.map((section) => (
          <section key={section.id}>
            <h2 className="mb-4 text-2xl font-semibold text-foreground">
              {section.title}
            </h2>
            <ImageAccordionRow items={section.items} />
          </section>
        ))}
      </div>
    </div>
    </div>
  );
}
