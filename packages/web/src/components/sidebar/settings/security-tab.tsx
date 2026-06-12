"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { tauriNavigate } from "@/lib/navigate";
import { removeToken } from "@/lib/auth";
import { sdk } from "@/lib/sdk";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function SecurityTab() {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const router = useRouter();
  const [newSecret, setNewSecret] = useState("");
  const [secretSaved, setSecretSaved] = useState(false);

  const handleChangeSecret = async () => {
    try {
      await sdk.auth.changeSecret(newSecret);
      setSecretSaved(true);
      removeToken();
      setTimeout(() => tauriNavigate(router, "/login"), 800);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2.5 block">
          {t("security")}
        </label>
        <div className="flex items-center gap-2">
          <Input
            type="password"
            autoComplete="new-password"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            className="h-8 text-sm flex-1"
            placeholder={t("newSecretPlaceholder")}
            value={newSecret}
            onChange={(e) => {
              setNewSecret(e.target.value);
              setSecretSaved(false);
            }}
            onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
          />
          <Button size="sm" onClick={handleChangeSecret} disabled={secretSaved}>
            {secretSaved ? tc("saved") : tc("save")}
          </Button>
        </div>
        {secretSaved && <p className="text-xs text-muted-foreground mt-1">{t("redirecting")}</p>}
      </div>
    </div>
  );
}
