// 配置读写辅助函数

const CONFIG_PATH = 'config.json';

async function readConfig() {
  return (await window.AgentSpacesUI.readConfigJson(CONFIG_PATH)) || {};
}

async function writeConfig(data) {
  await window.AgentSpacesUI.writeConfigJson(CONFIG_PATH, data);
}

async function mergeConfig(partial) {
  const prev = await readConfig();
  await writeConfig({ ...prev, ...partial });
}

async function persistProviderStates(states, currentText, currentProvider) {
  const providers = {};
  for (const [key, state] of Object.entries(states)) {
    providers[key] = { ...state };
  }
  await mergeConfig({ text: currentText, provider: currentProvider, providers });
}

export { readConfig, writeConfig, mergeConfig, persistProviderStates };
