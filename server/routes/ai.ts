import { db } from "../db/client.ts";
import { openrouterIntegration } from "../integrations/openrouter.ts";

export async function handleAIRoutes(req: Request, pathname: string): Promise<Response> {
  const pathParts = pathname.split("/").filter(Boolean);

  // GET /api/ai/config - Get AI configuration
  if (req.method === "GET" && pathParts.length === 3 && pathParts[2] === "config") {
    try {
      const result = await db.query("SELECT * FROM ai_config WHERE id = 1");
      
      if (result.rows.length === 0) {
        return new Response(JSON.stringify({ error: "AI config not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify(result.rows[0]), {
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

      const result = await db.query(
        `UPDATE ai_config 
         SET model = COALESCE($1, model), 
             system_prompt = COALESCE($2, system_prompt), 
             temperature = COALESCE($3, temperature)
         WHERE id = 1 
         RETURNING *`,
        [model, system_prompt, temperature]
      );

      return new Response(JSON.stringify(result.rows[0]), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: (error as Error).message }), {
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

  // POST /api/ai/process/:packageId - Process an info package with AI
  if (req.method === "POST" && pathParts.length === 4 && pathParts[2] === "process") {
    try {
      const packageId = pathParts[3];

      // Get the info package
      const packageResult = await db.query(
        "SELECT * FROM info_packages WHERE id = $1",
        [packageId]
      );

      if (packageResult.rows.length === 0) {
        return new Response(JSON.stringify({ error: "Info package not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }

      const infoPackage = packageResult.rows[0] as any;

      // Get AI config
      const configResult = await db.query("SELECT * FROM ai_config WHERE id = 1");
      const aiConfig = configResult.rows[0] as any;

      // Construct the user prompt with the info package data and directive
      const userPrompt = `${infoPackage.directive}\n\nHere is the data to work with:\n${JSON.stringify(infoPackage.data, null, 2)}`;

      // Call OpenRouter to process
      const aiResponse = await openrouterIntegration.execute({
        model: aiConfig.model,
        systemPrompt: aiConfig.system_prompt,
        userPrompt,
        temperature: aiConfig.temperature,
      });

      // Store the AI response in content table
      const contentResult = await db.query(
        `INSERT INTO content (info_package_id, content, chat_history) 
         VALUES ($1, $2, $3) 
         RETURNING *`,
        [packageId, aiResponse.content, JSON.stringify([])]
      );

      // Mark info package as processed
      await db.query(
        "UPDATE info_packages SET processed = true WHERE id = $1",
        [packageId]
      );

      return new Response(JSON.stringify(contentResult.rows[0]), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
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
