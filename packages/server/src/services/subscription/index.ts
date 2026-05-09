import type { SubscriptionConfig, SubscriptionQuota } from '@agent-spaces/shared'
import { SubscriptionProviderBase } from './base.js'
import { ZhiPuSubscriptionProvider } from './zhipu.js'

const providers: SubscriptionProviderBase[] = [
  new ZhiPuSubscriptionProvider(),
]

function getProvider(provider: string): SubscriptionProviderBase {
  const p = providers.find(p => p.provider === provider)
  if (!p) throw new Error(`Unknown subscription provider: ${provider}`)
  return p
}

export async function fetchQuota(config: SubscriptionConfig): Promise<SubscriptionQuota> {
  return getProvider(config.provider).fetchQuota(config)
}

export { SubscriptionProviderBase, ZhiPuSubscriptionProvider }
