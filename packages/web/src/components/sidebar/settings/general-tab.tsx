"use client";

import { useTranslations } from "next-intl";
import { StartupTab } from "./startup-tab";
import { LanguageTab } from "./language-tab";
import { AccountTab } from "./account-tab";
import { SecurityTab } from "./security-tab";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2.5">
      <h3 className="text-xs font-semibold text-foreground">{title}</h3>
      <div className="rounded-lg border border-border/60 p-4">
        {children}
      </div>
    </div>
  );
}

export function GeneralTab() {
  const t = useTranslations("settings");

  return (
    <div className="space-y-5">
      <Section title={t("startup")}>
        <StartupTab />
      </Section>
      <Section title={t("language")}>
        <LanguageTab />
      </Section>
      <Section title={t("userAvatar")}>
        <AccountTab />
      </Section>
      <Section title={t("security")}>
        <SecurityTab />
      </Section>
    </div>
  );
}
