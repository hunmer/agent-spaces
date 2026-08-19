'use client';

import { useEffect } from "react";
import { initProcmLogger } from "@/lib/procm-logger";

export function ProcmLoggerInit() {
  useEffect(() => {
    void initProcmLogger();
  }, []);

  return null;
}
