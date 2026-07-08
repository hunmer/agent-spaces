"use client";

import { useEffect, useState } from "react";
import type { Workspace } from "@agent-spaces/shared";
import { authHeaders } from "@/lib/auth";
import { TeamManagementPage } from "@/components/teams/team-management-page";

export default function Page() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);

  useEffect(() => {
    fetch("/api/workspaces", { headers: authHeaders() })
      .then((response) => (response.ok ? response.json() : []))
      .then(setWorkspaces);
  }, []);

  return <TeamManagementPage initialWorkspaces={workspaces} />;
}
