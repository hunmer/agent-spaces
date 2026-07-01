export function submitWorkflowMiniApp(payload) {
  window.parent?.postMessage(
    {
      source: "agent-spaces:workflow-miniapp-submit",
      payload,
    },
    "*",
  );
}
