type PluginConfigValues = Record<string, string>;

export async function loadPluginConfigValues({
  schemeName,
  legacyWorkflowId,
  readScheme,
  readLegacyScheme,
  saveScheme,
  readDefault,
}: {
  schemeName?: string;
  legacyWorkflowId?: string;
  readScheme: () => Promise<PluginConfigValues>;
  readLegacyScheme: () => Promise<PluginConfigValues>;
  saveScheme: (values: PluginConfigValues) => Promise<void>;
  readDefault: () => Promise<PluginConfigValues>;
}): Promise<PluginConfigValues> {
  if (!schemeName) return readDefault();

  try {
    return await readScheme();
  } catch {
    if (legacyWorkflowId) {
      try {
        const legacyValues = await readLegacyScheme();
        try {
          await saveScheme(legacyValues);
        } catch {
          // Migration is best-effort; the legacy values are still usable.
        }
        return legacyValues;
      } catch {
        // The workflow may reference a scheme that no longer exists.
      }
    }
    return readDefault();
  }
}
