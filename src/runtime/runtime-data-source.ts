/** Whether bundled fixtures may be shown when the backend is unavailable. */
export function isFixtureFallbackAllowed(mode = import.meta.env.MODE): boolean {
  return mode !== "production";
}
