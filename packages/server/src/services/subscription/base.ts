import type { SubscriptionConfig, SubscriptionProvider, SubscriptionQuota } from '@agent-spaces/shared'

export abstract class SubscriptionProviderBase {
  abstract readonly provider: SubscriptionProvider

  abstract fetchQuota(config: SubscriptionConfig): Promise<SubscriptionQuota>
}
