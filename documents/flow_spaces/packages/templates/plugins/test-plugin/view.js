module.exports = {
  data() {
    return {
      status: 'CDN plugin is active',
    }
  },
  template: `
    <div class="space-y-2">
      <div class="text-sm font-medium">Web Client Plugin</div>
      <div class="text-xs text-muted-foreground">{{ pluginInfo.description }}</div>
      <div class="rounded-md border border-border bg-muted/40 p-3 text-xs">
        {{ status }}
      </div>
    </div>
  `,
}
