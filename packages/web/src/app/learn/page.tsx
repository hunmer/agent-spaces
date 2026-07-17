"use client";

import { ImageAccordionRow, type AccordionItem } from "@/components/ui/interactive-image-accordion";
import { useTranslations } from "next-intl";
import { Rocket, Zap, Code, type LucideIcon } from "lucide-react";

const sections: { id: string; title: string; icon: LucideIcon; items: AccordionItem[] }[] = [
  {
    id: "quick-start",
    title: "快速上手",
    icon: Rocket,
    items: [
      { id: "qs-1", title: "认识 Agent Spaces", imageUrl: "https://placehold.co/600x800/1f2937/ffffff?text=Agent+Spaces", mdPath: "/learn/intro.md" },
      { id: "qs-2", title: "添加 LLM 供应商", imageUrl: "https://placehold.co/600x800/1f2937/ffffff?text=LLM+Provider", mdPath: "/learn/add-provider.md" },
      { id: "qs-3", title: "配置 Agent", imageUrl: "https://placehold.co/600x800/1f2937/ffffff?text=Agent", mdPath: "/learn/configure-agent.md" },
      { id: "qs-4", title: "Agent Chat", imageUrl: "https://placehold.co/600x800/1f2937/ffffff?text=Chat", mdPath: "/learn/agent-chat.md" },
      { id: "qs-5", title: "添加工作区", imageUrl: "https://placehold.co/600x800/1f2937/ffffff?text=Workspace", mdPath: "/learn/add-workspace.md" },
    ],
  },
  {
    id: "advanced",
    title: "进阶使用",
    icon: Zap,
    items: [
      { id: "ad-1", title: "工作流", imageUrl: "https://placehold.co/600x800/312e81/ffffff?text=Workflow", mdPath: "/learn/workflow.md" },
      { id: "ad-2", title: "团队模式", imageUrl: "https://placehold.co/600x800/312e81/ffffff?text=Team", mdPath: "/learn/team.md" },
      { id: "ad-3", title: "MiniApp", imageUrl: "https://placehold.co/600x800/312e81/ffffff?text=MiniApp", mdPath: "/learn/miniapp.md" },
      { id: "ad-4", title: "Hook", imageUrl: "https://placehold.co/600x800/312e81/ffffff?text=Hook", mdPath: "/learn/hook.md" },
    ],
  },
  {
    id: "for-developers",
    title: "面向开发者",
    icon: Code,
    items: [
      { id: "fd-1", title: "编写 MiniApp", imageUrl: "https://placehold.co/600x800/065f46/ffffff?text=Build+MiniApp", mdPath: "/learn/build-miniapp.md" },
      { id: "fd-2", title: "参与开发", imageUrl: "https://placehold.co/600x800/065f46/ffffff?text=Contribute", mdPath: "/learn/contribute.md" },
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
        {sections.map((section) => {
          const Icon = section.icon;
          return (
          <section key={section.id}>
            <h2 className="mb-4 flex items-center gap-2 text-2xl font-semibold text-foreground">
              <Icon className="size-6" />
              {section.title}
            </h2>
            <ImageAccordionRow items={section.items} />
          </section>
          );
        })}
      </div>
    </div>
    </div>
  );
}
