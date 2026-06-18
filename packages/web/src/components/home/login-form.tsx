"use client"

import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { Settings2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Field,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { setToken } from "@/lib/auth"
import { loginRedirectUrl } from "@/lib/routes"
import { sdk } from "@/lib/sdk"
import { tauriNavigate } from "@/lib/navigate"
import {
  type ServerConfig,
  loadServers,
  saveServers,
  loadActiveId,
  saveActiveId,
  setActiveServerCookie,
} from "@/lib/server"
import { ServerManagerDialog } from "@/components/sidebar/server-manager-dialog"

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<"form">) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const t = useTranslations("login")
  const [secret, setSecret] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [servers, setServers] = useState<ServerConfig[]>(loadServers)
  const [activeId, setActiveId] = useState(loadActiveId)
  const [managerOpen, setManagerOpen] = useState(false)

  const handleLogin = async () => {
    setLoading(true)
    setError("")
    try {
      const data = await sdk.auth.login(secret)
      setToken(data.token)
      tauriNavigate(router, loginRedirectUrl(searchParams.toString()))
    } catch (err) {
      console.error("[login] network error", err)
      setError(err instanceof Error ? err.message : t("networkError"))
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <form className={cn("flex flex-col gap-6", className)} {...props}>
        <FieldGroup>
          <div className="flex flex-col items-center gap-1 text-center">
            <h1 className="text-2xl font-bold">{t("title")}</h1>
            <p className="text-sm text-balance text-muted-foreground">
              {t("subtitle")}
            </p>
          </div>
          <Field>
            <FieldLabel htmlFor="secret">{t("secretKey")}</FieldLabel>
            <Input
              id="secret"
              type="password"
              placeholder={t("secretPlaceholder")}
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              autoFocus
            />
          </Field>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Field>
            <Button type="button" onClick={handleLogin} disabled={loading}>
              {loading ? t("verifying") : t("login")}
            </Button>
          </Field>
          <Field>
            <Button
              variant="outline"
              type="button"
              onClick={() => setManagerOpen(true)}
            >
              <Settings2 className="size-4 mr-2" />
              {t("manageServers")}
            </Button>
          </Field>
        </FieldGroup>
      </form>

      <ServerManagerDialog
        open={managerOpen}
        onOpenChange={setManagerOpen}
        servers={servers}
        activeId={activeId}
        onUpdate={(updated) => {
          setServers(updated)
          saveServers(updated)
        }}
        onRemove={(id) => {
          if (id === "default") return
          const updated = servers.filter((s) => s.id !== id)
          setServers(updated)
          saveServers(updated)
          if (activeId === id) {
            const fallback = updated.find((s) => s.id === "default") || updated[0]
            if (fallback) {
              setActiveId(fallback.id)
              saveActiveId(fallback.id)
              setActiveServerCookie(fallback.url)
            }
          }
        }}
        onSwitch={(server) => {
          setActiveId(server.id)
          saveActiveId(server.id)
          setActiveServerCookie(server.url)
        }}
      />
    </>
  )
}
