import { WorkspacesPage } from "@/components/workspaces/workspaces-page"

async function getWorkspaces() {
  const res = await fetch("http://localhost:3100/api/workspaces", {
    cache: "no-store",
  })
  if (!res.ok) return []
  return res.json()
}

export default async function Page() {
  const workspaces = await getWorkspaces()
  return <WorkspacesPage initialWorkspaces={workspaces} />
}
