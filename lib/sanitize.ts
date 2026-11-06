/** Strip newlines and double-quotes so external strings can't break out of
 *  their quoted context when interpolated into an LLM prompt. */
export function sanitizeForPrompt(s: string): string {
  return s.replace(/[\r\n"]/g, " ").trim();
}
