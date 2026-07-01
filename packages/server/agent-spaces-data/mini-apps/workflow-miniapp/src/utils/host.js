export function submitWorkflowMiniApp(payload) {
  console.debug("[workflow-miniapp] submitWorkflowMiniApp", payload);
  window.parent?.postMessage(
    {
      source: "agent-spaces:workflow-miniapp-submit",
      payload,
    },
    "*",
  );
}
