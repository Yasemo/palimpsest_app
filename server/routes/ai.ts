import { db } from "../db/client.ts";
import { openrouterIntegration } from "../integrations/openrouter.ts";
import { config } from "../config.ts";
import { processInfoPackageWithAI } from "../schedulers/utils.ts";

export async function handleAIRoutes(req: Request, pathname: string): Promise<Response> {
  const pathParts = pathname.split("/").filter(Boolean);

  // GET /api/ai/config - Get AI configuration
  if (req.method === "GET" && pathParts.length === 3 && pathParts[2] === "config") {
    try {
      const result = await db.query("SELECT * FROM ai_config WHERE id = 1");
      
      if (result.rows.length === 0) {
        // Return default config from environment variables if none exists
        return new Response(JSON.stringify({
          model: config.ai.defaultModel,
          temperature: 0.7,
          system_prompt: "You are a helpful AI assistant that processes information and creates well-structured content."
        }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      // Use environment variable as fallback for model
      const aiConfigRow = result.rows[0] as any;
      if (!aiConfigRow.model) {
        aiConfigRow.model = config.ai.defaultModel;
      }

      return new Response(JSON.stringify(aiConfigRow), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: (error as Error).message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  // PUT /api/ai/config - Update AI configuration
  if (req.method === "PUT" && pathParts.length === 3 && pathParts[2] === "config") {
    try {
      const body = await req.json();
      const { model, system_prompt, temperature } = body;

      console.log('[AI Config] Updating configuration:', { model, temperature, hasSystemPrompt: !!system_prompt });

      // Use INSERT ... ON CONFLICT to handle both insert and update
      const result = await db.query(
        `INSERT INTO ai_config (id, model, system_prompt, temperature) 
         VALUES (1, $1, $2, $3)
         ON CONFLICT (id) 
         DO UPDATE SET 
           model = COALESCE(EXCLUDED.model, ai_config.model),
           system_prompt = COALESCE(EXCLUDED.system_prompt, ai_config.system_prompt),
           temperature = COALESCE(EXCLUDED.temperature, ai_config.temperature)
         RETURNING *`,
        [model, system_prompt, temperature]
      );

      console.log('[AI Config] Configuration updated successfully');

      if (result.rows.length === 0) {
        console.error('[AI Config] No rows returned from query');
        return new Response(JSON.stringify({ error: 'Failed to save configuration' }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify(result.rows[0]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      console.error('[AI Config] Error updating configuration:', error);
      return new Response(JSON.stringify({ 
        error: (error as Error).message || 'Failed to update AI configuration'
      }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  // GET /api/ai/models - Get available OpenRouter models
  if (req.method === "GET" && pathParts.length === 3 && pathParts[2] === "models") {
    try {
      const models = await openrouterIntegration.getAvailableModels();
      return new Response(JSON.stringify(models), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: (error as Error).message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  // GET /api/ai/credits - Get current OpenRouter credit balance
  if (req.method === "GET" && pathParts.length === 3 && pathParts[2] === "credits") {
    try {
      const credits = await openrouterIntegration.getCredits();
      return new Response(JSON.stringify(credits), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: (error as Error).message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  // POST /api/ai/process/:packageId - Process an info package with AI
  if (req.method === "POST" && pathParts.length === 4 && pathParts[2] === "process") {
    try {
      const packageId = parseInt(pathParts[3]);
      
      console.log(`[AI Route] Manual processing requested for info package ${packageId}`);

      // Use the shared processing function that has all logging and citations extraction
      const content = await processInfoPackageWithAI(db, packageId, openrouterIntegration);

      console.log(`[AI Route] Processing completed, content ID: ${content.id}`);

      return new Response(JSON.stringify(content), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      console.error(`[AI Route] Processing failed:`, error);
      return new Response(JSON.stringify({ error: (error as Error).message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  return new Response(JSON.stringify({ error: "Not found" }), {
    status: 404,
    headers: { "Content-Type": "application/json" },
  });
}
