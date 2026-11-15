import Anthropic from "@anthropic-ai/sdk";

export const MODEL = "claude-opus-5-5";

export function hasClaudeCredentials() {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

let client: Anthropic | null = null;
export function claude() {
  if (!client) client = new Anthropic();
  return client;
}

export function describeError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return "Claude API key is invalid.";
  if (err instanceof Anthropic.RateLimitError) return "Claude is rate limited — try again in a minute.";
  if (err instanceof Anthropic.BadRequestError) return `Claude rejected the request: ${err.message}`;
  if (err instanceof Anthropic.APIError) return `Claude API error ${err.status}: ${err.message}`;
  if (err instanceof Error) return err.message;
  return "Unknown error";
}
