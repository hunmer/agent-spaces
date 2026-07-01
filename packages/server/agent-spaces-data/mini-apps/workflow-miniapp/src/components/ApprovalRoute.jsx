import { submitWorkflowMiniApp } from "../utils/host";

const { Button, Card, CardContent } = window.AgentSpacesUI;

export default function ApprovalRoute({ payload }) {
  const requester = typeof payload.requester === "string" && payload.requester ? payload.requester : "Unknown requester";
  const reason = typeof payload.reason === "string" && payload.reason ? payload.reason : "No reason provided";
  const amount = typeof payload.amount === "number"
    ? payload.amount
    : Number.isFinite(Number(payload.amount))
      ? Number(payload.amount)
      : 0;

  const submitDecision = (decision) => {
    submitWorkflowMiniApp({
      route: "approval",
      decision,
      requester,
      amount,
      reason,
      reviewedAt: new Date().toISOString(),
    });
  };

  return (
    <Card className="border-border/60">
      <CardContent className="space-y-4 p-5">
        <div>
          <div className="text-sm text-muted-foreground">Route 2 /approval</div>
          <h2 className="text-2xl font-semibold">Approval review</h2>
        </div>

        <div className="grid gap-3 rounded-lg border border-border/70 bg-muted/20 p-4 text-sm">
          <div><span className="text-muted-foreground">Requester: </span>{requester}</div>
          <div><span className="text-muted-foreground">Amount: </span>{amount}</div>
          <div><span className="text-muted-foreground">Reason: </span>{reason}</div>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button onClick={() => submitDecision("approved")}>Approve and continue</Button>
          <Button variant="outline" onClick={() => submitDecision("rejected")}>Reject and continue</Button>
        </div>
      </CardContent>
    </Card>
  );
}
