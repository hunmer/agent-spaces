"use client";

import { useEffect, useState } from "react";
import { HomePage } from "@/components/home/home-page";
import { authHeaders } from "@/lib/auth";
import type { Workspace } from "@agent-spaces/shared";

export default function Page() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);

  useEffect(() => {
    fetch("/api/workspaces", { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : []))
      .then(setWorkspaces);
  }, []);

  return <HomePage initialWorkspaces={workspaces} />;
}
