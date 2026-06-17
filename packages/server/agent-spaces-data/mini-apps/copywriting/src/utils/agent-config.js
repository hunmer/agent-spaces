// 创作 Agent 配置（共享 config）。
// 区别于 settings.json（用户个人偏好/状态），创作 Agent 属于项目级共享配置，
// 所有访问该 mini-app 的用户共用同一份，存于 configs/agent.json。

const AGENT_CONFIG_PATH = 'agent.json';

export async function loadAgentConfig() {
  const v = await window.AgentSpacesUI.readConfigJson(AGENT_CONFIG_PATH);
  return v && typeof v === 'object' ? v : {};
}

export async function saveAgentConfig(next) {
  await window.AgentSpacesUI.writeConfigJson(AGENT_CONFIG_PATH, next);
}
