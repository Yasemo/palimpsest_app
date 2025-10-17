import "https://deno.land/std@0.208.0/dotenv/load.ts";

export const config = {
  database: {
    url: Deno.env.get("DATABASE_URL") || "",
  },
  perplexity: {
    apiKey: Deno.env.get("PERPLEXITY_API_KEY") || "",
  },
  openrouter: {
    apiKey: Deno.env.get("OPENROUTER_API_KEY") || "",
  },
  ai: {
    defaultModel: Deno.env.get("DEFAULT_AI_MODEL") || "openai/gpt-4o",
    defaultContentEditorModel: Deno.env.get("DEFAULT_CONTENT_EDITOR_MODEL") || "anthropic/claude-3.5-sonnet",
  },
  gmail: {
    clientId: Deno.env.get("GMAIL_CLIENT_ID") || "",
    clientSecret: Deno.env.get("GMAIL_CLIENT_SECRET") || "",
    refreshToken: Deno.env.get("GMAIL_REFRESH_TOKEN") || "",
    userEmail: Deno.env.get("GMAIL_USER_EMAIL") || "",
  },
  server: {
    environment: Deno.env.get("ENVIRONMENT") || "local",
    port: parseInt(Deno.env.get("PORT") || "8000"),
  },
};

// Validate required configuration
export function validateConfig(): { valid: boolean; missing: string[] } {
  const missing: string[] = [];

  if (!config.database.url) missing.push("DATABASE_URL");
  if (!config.perplexity.apiKey) missing.push("PERPLEXITY_API_KEY");
  if (!config.openrouter.apiKey) missing.push("OPENROUTER_API_KEY");

  return {
    valid: missing.length === 0,
    missing,
  };
}
