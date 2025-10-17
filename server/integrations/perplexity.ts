import { Integration } from "./base.ts";
import { config } from "../config.ts";

export class PerplexityIntegration extends Integration {
  name = "perplexity";
  requiredEnvVars = ["PERPLEXITY_API_KEY"];

  async validate(): Promise<boolean> {
    console.log("[Perplexity] Validating integration...");
    const envCheck = this.checkEnvVars();
    if (!envCheck.valid) {
      console.log("[Perplexity] ❌ Environment variables not set");
      return false;
    }

    // Actually test the API key by making a minimal request
    try {
      console.log("[Perplexity] Testing API connection...");
      const response = await fetch("https://api.perplexity.ai/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${config.perplexity.apiKey}`,
        },
        body: JSON.stringify({
          model: "sonar-pro",
          messages: [
            {
              role: "user",
              content: "test",
            },
          ],
          max_tokens: 10,
        }),
      });

      if (response.ok) {
        console.log("[Perplexity] ✅ Connected successfully");
      } else {
        console.log(`[Perplexity] ❌ API error: ${response.status}`);
      }
      return response.ok;
    } catch (error) {
      console.error("[Perplexity] ❌ Validation error:", error);
      return false;
    }
  }

  async execute(sourceConfig: any): Promise<any> {
    const { 
      prompt, 
      model = "sonar-pro",
      temperature = 0.2,
      max_tokens = 4096
    } = sourceConfig;

    if (!prompt) {
      throw new Error("Perplexity integration requires a 'prompt' in config");
    }

    // Use the latest Perplexity API endpoint
    const response = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${config.perplexity.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: "You are a helpful research assistant that provides comprehensive, well-sourced information about current events and topics.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature,
        max_tokens,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Perplexity API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    
    // Return only essential data - strip out all metadata bloat
    // Only content and citations are needed for downstream AI processing
    return {
      content: data.choices[0]?.message?.content || "",
      citations: data.citations || [],
    };
  }

  getConfigSchema(): object {
    return {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: "The search query or prompt for Perplexity",
          required: true,
        },
        model: {
          type: "string",
          description: "Perplexity model to use (sonar-pro is recommended)",
          default: "sonar-pro",
          enum: [
            "sonar-pro",
            "sonar",
          ],
        },
        temperature: {
          type: "number",
          description: "Controls randomness (0.0-1.0). Lower = focused, higher = creative",
          default: 0.2,
          minimum: 0,
          maximum: 1,
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

export const perplexityIntegration = new PerplexityIntegration();
