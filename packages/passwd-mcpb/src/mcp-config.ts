/**
 * Try to parse the note field as JSON (lenient: comments, trailing commas, single quotes).
 * Returns the parsed object if valid JSON, null otherwise.
 *
 * Security boundary: free text (potential prompt injection) → null.
 * Valid JSON → structured data passed to AI as mcpConfig.
 * The AI reads the JSON structure and extracts what it needs for connect_mcp_service.
 */
export function extractMcpConfig(note: unknown): Record<string, unknown> | null {
  if (typeof note !== "string" || !note.trim()) return null;

  try {
    const cleaned = note
      .replace(/(?<![:"\\])\/\/.*$/gm, "")  // strip // comments (not inside strings)
      .replace(/,\s*([}\]])/g, "$1")         // strip trailing commas
      .replace(/'/g, '"');                    // single quotes → double quotes
    const parsed = JSON.parse(cleaned);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch {}

  return null;
}
