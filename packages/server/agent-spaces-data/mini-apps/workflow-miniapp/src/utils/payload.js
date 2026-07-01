export function getPayloadFromQuery(query) {
  const raw = typeof query?.payload === "string" ? query.payload : "";
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}
