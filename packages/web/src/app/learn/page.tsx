"use client";

import { LandingAccordionItem, type AccordionItem } from "@/components/ui/interactive-image-accordion";
import { useTranslations } from "next-intl";

const accordionItems: AccordionItem[] = [
  {
    id: 1,
    title: "Voice Assistant",
    imageUrl: "https://images.unsplash.com/photo-1628258334105-2a0b3d6efee1?q=80&w=1974&auto=format&fit=crop",
    url: "https://www.example.com/voice-assistant",
  },
  {
    id: 2,
    title: "AI Image Generation",
    imageUrl: "https://images.unsplash.com/photo-1677756119517-756a188d2d94?q=80&w=2070&auto=format&fit=crop",
    url: "https://www.example.com/image-generation",
  },
  {
    id: 3,
    title: "AI Chatbot + Local RAG",
    imageUrl: "https://images.unsplash.com/photo-1515879218367-8466d910aaa4?q=80&w=1974&auto=format&fit=crop",
    url: "https://www.example.com/chatbot-rag",
  },
  {
    id: 4,
    title: "AI Agent",
    imageUrl: "https://images.unsplash.com/photo-1526628953301-3e589a6a8b74?q=80&w=2090&auto=format&fit=crop",
    url: "https://www.example.com/ai-agent",
  },
  {
    id: 5,
    title: "Visual Understanding",
    imageUrl: "https://images.unsplash.com/photo-1554415707-6e8cfc93fe23?q=80&w=2070&auto=format&fit=crop",
    url: "https://www.example.com/visual-understanding",
  },
];

export default function LearnPage() {
  const t = useTranslations("learn");
  return (
    <div className="w-full">
      <LandingAccordionItem
        items={accordionItems}
        title={t("title")}
        description={t("description")}
      />
    </div>
  );
}
