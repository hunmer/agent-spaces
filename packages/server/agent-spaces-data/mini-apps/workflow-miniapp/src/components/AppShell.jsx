import { useEffect, useMemo, useState } from "react";
import { parseRoute, useRouter } from "@agent-spaces/ui";
import WelcomeRoute from "./WelcomeRoute";
import ApprovalRoute from "./ApprovalRoute";
import SurveyRoute from "./SurveyRoute";
import {
  getPayloadFromQuery,
  getPayloadFromRuntime,
  getRouteStateFromLocation,
  getRuntimeDebugInfo,
  subscribeRuntimePayload,
} from "../utils/payload";

const { Button, Card, CardContent, Badge } = window.AgentSpacesUI;

const ROUTES = [
  { key: "welcome", label: "Welcome" },
  { key: "approval", label: "Approval" },
  { key: "survey", label: "Survey" },
];

export default function AppShell() {
  const router = useRouter();
  const locationRouteState = useMemo(() => getRouteStateFromLocation(parseRoute), []);
  const [runtimePayload, setRuntimePayload] = useState(() => getPayloadFromRuntime());
  const [runtimeDebug, setRuntimeDebug] = useState(() => getRuntimeDebugInfo());
  const effectivePath = router.path.length > 0 ? router.path : locationRouteState.path;
  const effectiveQuery = Object.keys(router.query || {}).length > 0 ? router.query : locationRouteState.query;
  const currentRoute = ROUTES.some((item) => item.key === effectivePath[0]) ? effectivePath[0] : "welcome";
  const queryPayload = getPayloadFromQuery(effectiveQuery);
  const payloadSource = Object.keys(runtimePayload).length > 0 ? "runtime" : "query";
  const payload = payloadSource === "runtime" ? runtimePayload : queryPayload;

  useEffect(() => {
    if (router.path.length === 0 && locationRouteState.path.length > 0) {
      router.replace(locationRouteState.path, locationRouteState.query);
    }
  }, [locationRouteState.path, locationRouteState.query, router]);

  useEffect(() => subscribeRuntimePayload((nextPayload) => {
    console.debug("[workflow-miniapp] runtime payload updated", nextPayload);
    setRuntimePayload(nextPayload);
    setRuntimeDebug(getRuntimeDebugInfo());
  }), []);

  useEffect(() => {
    const nextDebug = getRuntimeDebugInfo();
    setRuntimeDebug(nextDebug);
    console.debug("[workflow-miniapp] payload resolution", {
      payloadSource,
      runtimePayload,
      queryPayload,
      effectiveQuery,
      nextDebug,
    });
  }, [payloadSource, runtimePayload, queryPayload, effectiveQuery]);

  const navigate = (nextRoute) => {
    router.push([nextRoute], effectiveQuery);
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-4 p-4">
        <Card className="border-border/60 bg-card/95 shadow-sm">
          <CardContent className="flex flex-col gap-4 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-2">
                <Badge variant="secondary">workflow-miniapp demo</Badge>
                <div>
                  <h1 className="text-xl font-semibold">Workflow miniapp interaction demo</h1>
                  <p className="text-sm text-muted-foreground">
                    Runtime params come from the host bridge. Buttons submit results through postMessage so the workflow can continue.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {ROUTES.map((item) => (
                  <Button
                    key={item.key}
                    variant={currentRoute === item.key ? "default" : "outline"}
                    size="sm"
                    onClick={() => navigate(item.key)}
                  >
                    {item.label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-dashed border-border/70 bg-muted/30 p-3">
              <div className="mb-2 text-xs font-medium text-foreground">Debug</div>
              <pre className="mb-3 overflow-auto whitespace-pre-wrap break-all text-xs text-muted-foreground">
                {JSON.stringify({
                  payloadSource,
                  routerPath: router.path,
                  routerQuery: router.query,
                  effectivePath,
                  effectiveQuery,
                  runtimeDebug,
                }, null, 2)}
              </pre>
              <div className="mb-1 text-xs font-medium text-foreground">Payload received</div>
              <pre className="overflow-auto whitespace-pre-wrap break-all text-xs text-muted-foreground">
                {JSON.stringify(payload, null, 2)}
              </pre>
            </div>
          </CardContent>
        </Card>

        {currentRoute === "approval" ? (
          <ApprovalRoute payload={payload} />
        ) : currentRoute === "survey" ? (
          <SurveyRoute payload={payload} />
        ) : (
          <WelcomeRoute payload={payload} />
        )}
      </div>
    </main>
  );
}
