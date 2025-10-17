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

    // Ensure temperature and max_tokens are numbers
    const tempNumber = typeof temperature === 'string' ? parseFloat(temperature) : temperature;
    const maxTokensNumber = typeof max_tokens === 'string' ? parseInt(max_tokens) : max_tokens;

    const requestBody = {
      model,
      messages,
      temperature: tempNumber,
      max_tokens: maxTokensNumber,
    };

    console.log("[OpenRouter] 📤 Sending request to OpenRouter API");
    console.log("[OpenRouter] Model:", model);
    console.log("[OpenRouter] Temperature:", tempNumber);
    console.log("[OpenRouter] Max Tokens:", maxTokensNumber);
    console.log("[OpenRouter] System Prompt Length:", systemPrompt ? systemPrompt.length : 0, "characters");
    console.log("[OpenRouter] User Prompt Length:", userPrompt.length, "characters");
    console.log("[OpenRouter] Message Count:", messages.length);

    const startTime = Date.now();

    // Use the latest OpenRouter API endpoint with proper headers
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${config.openrouter.apiKey}`,
        "HTTP-Referer": "https://palimpsest.app", // For rankings
        "X-Title": "Palimpsest PR App", // Site name for transparency
      },
      body: JSON.stringify(requestBody),
    });

    const endTime = Date.now();
    const duration = endTime - startTime;

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[OpenRouter] ❌ API Error:", response.status);
      console.error("[OpenRouter] Error Details:", errorText);
      console.error("[OpenRouter] Request took:", duration, "ms");
      throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    
    console.log("[OpenRouter] 📥 Full API Response:", JSON.stringify(data, null, 2));
    console.log("[OpenRouter] ✅ Response received");
    console.log("[OpenRouter] Request Duration:", duration, "ms");
    console.log("[OpenRouter] Model Used:", data.model);
    console.log("[OpenRouter] Response Length:", data.choices[0]?.message?.content?.length || 0, "characters");
    
    if (data.usage) {
      console.log("[OpenRouter] 📊 Token Usage:");
      console.log("[OpenRouter]   - Prompt Tokens:", data.usage.prompt_tokens);
      console.log("[OpenRouter]   - Completion Tokens:", data.usage.completion_tokens);
      console.log("[OpenRouter]   - Total Tokens:", data.usage.total_tokens);
    }

    // Log cost estimation if available
    if (data.usage && data.usage.prompt_tokens && data.usage.completion_tokens) {
      const estimatedCost = this.estimateCost(data.usage.prompt_tokens, data.usage.completion_tokens, model);
      if (estimatedCost > 0) {
        console.log("[OpenRouter] 💰 Estimated Cost: $" + estimatedCost.toFixed(4));
      }
    }
    
    return {
      content: data.choices[0]?.message?.content || "",
      model: data.model,
      usage: data.usage,
      timestamp: new Date().toISOString(),
    };
  }

  // Estimate cost based on token usage (rough estimates)
  private estimateCost(promptTokens: number, completionTokens: number, modelId: string): number {
    // These are rough estimates - actual costs may vary
    const costPerMillionPrompt: { [key: string]: number } = {
      'openai/gpt-4': 30,
      'openai/gpt-4-turbo': 10,
      'openai/gpt-4o': 5,
      'openai/gpt-3.5-turbo': 0.5,
      'anthropic/claude-3-opus': 15,
      'anthropic/claude-3-sonnet': 3,
      'anthropic/claude-3-haiku': 0.25,
      'anthropic/claude-3.5-sonnet': 3,
      'google/gemini-pro': 0.5,
    };

    const costPerMillionCompletion: { [key: string]: number } = {
      'openai/gpt-4': 60,
      'openai/gpt-4-turbo': 30,
      'openai/gpt-4o': 15,
      'openai/gpt-3.5-turbo': 1.5,
      'anthropic/claude-3-opus': 75,
      'anthropic/claude-3-sonnet': 15,
      'anthropic/claude-3-haiku': 1.25,
      'anthropic/claude-3.5-sonnet': 15,
      'google/gemini-pro': 1.5,
    };

    const promptCost = costPerMillionPrompt[modelId] || 5; // Default to 5 if unknown
    const completionCost = costPerMillionCompletion[modelId] || 10; // Default to 10 if unknown

    return (promptTokens / 1000000 * promptCost) + (completionTokens / 1000000 * completionCost);
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

  // Get current credit balance from OpenRouter
  async getCredits(): Promise<{ balance: number; total_credits: number; total_usage: number }> {
    const response = await fetch("https://openrouter.ai/api/v1/credits", {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${config.openrouter.apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch OpenRouter credits: ${response.status}`);
    }

    const data = await response.json();
    const { total_credits, total_usage } = data.data;
    const balance = total_credits - total_usage;

    return {
      balance,
      total_credits,
      total_usage,
    };
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
