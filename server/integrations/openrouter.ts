import { Integration } from "./base.ts";
import { config } from "../config.ts";

export class OpenRouterIntegration extends Integration {
  name = "openrouter";
  requiredEnvVars = ["OPENROUTER_API_KEY"];

  async validate(): Promise<boolean> {
    console.log("[OpenRouter] Validating integration...");
    const envCheck = this.checkEnvVars();
    if (!envCheck.valid) {
      console.log("[OpenRouter] ❌ Environment variables not set");
      return false;
    }

    // Actually test the API key by fetching available models
    try {
      console.log("[OpenRouter] Testing API connection...");
      const response = await fetch("https://openrouter.ai/api/v1/models", {
        headers: {
          "Authorization": `Bearer ${config.openrouter.apiKey}`,
          "Content-Type": "application/json",
        },
      });

      if (response.ok) {
        console.log("[OpenRouter] ✅ Connected successfully");
      } else {
        console.log(`[OpenRouter] ❌ API error: ${response.status}`);
      }
      return response.ok;
    } catch (error) {
      console.error("[OpenRouter] ❌ Validation error:", error);
      return false;
    }
  }

  // Process an info package with AI
  async execute(aiConfig: any): Promise<any> {
    const { 
      model, 
      systemPrompt, 
      userPrompt,
      temperature = 0.7,
      max_tokens = 4096
    } = aiConfig;

    if (!model || !userPrompt) {
      throw new Error("OpenRouter integration requires 'model' and 'userPrompt' in config");
    }

    const messages = [];
    
    if (systemPrompt) {
      messages.push({
        role: "system",
        content: systemPrompt,
      });
    }

    messages.push({
      role: "user",
      content: userPrompt,
    });

    // Use the latest OpenRouter API endpoint with proper headers
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${config.openrouter.apiKey}`,
        "HTTP-Referer": "https://palimpsest.app", // For rankings
        "X-Title": "Palimpsest PR App", // Site name for transparency
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    
    return {
      content: data.choices[0]?.message?.content || "",
      model: data.model,
      usage: data.usage,
      timestamp: new Date().toISOString(),
    };
  }

  // Get available models from OpenRouter
  async getAvailableModels(): Promise<any[]> {
    const response = await fetch("https://openrouter.ai/api/v1/models", {
      headers: {
        "Authorization": `Bearer ${config.openrouter.apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch OpenRouter models: ${response.status}`);
    }

    const data = await response.json();
    return data.data || [];
  }

  getConfigSchema(): object {
    return {
      type: "object",
      properties: {
        model: {
          type: "string",
          description: "The model to use (e.g., 'openai/gpt-4o', 'anthropic/claude-3.5-sonnet')",
          required: true,
        },
        systemPrompt: {
          type: "string",
          description: "System prompt to set AI behavior",
        },
        userPrompt: {
          type: "string",
          description: "The user prompt/message to send to the AI",
          required: true,
        },
        temperature: {
          type: "number",
          description: "Controls randomness (0.0-2.0)",
          default: 0.7,
          minimum: 0,
          maximum: 2,
        },
        max_tokens: {
          type: "number",
          description: "Maximum tokens in response",
          default: 4096,
        },
      },
    };
  }
}

export const openrouterIntegration = new OpenRouterIntegration();
