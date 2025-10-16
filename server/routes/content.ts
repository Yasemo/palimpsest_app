import { db } from "../db/client.ts";
import { openrouterIntegration } from "../integrations/openrouter.ts";

export async function handleContentRoutes(req: Request, pathname: string): Promise<Response> {
  const url = new URL(req.url);
  const pathParts = pathname.split("/").filter(Boolean);

  // GET /api/content - List all content with optional filters
  if (req.method === "GET" && pathParts.length === 2) {
    try {
      const limit = url.searchParams.get("limit") || "50";
      const fromDate = url.searchParams.get("from_date");
      const toDate = url.searchParams.get("to_date");

      let query = "SELECT * FROM content WHERE 1=1";
      const params: any[] = [];
      let paramIndex = 1;

      if (fromDate) {
        query += ` AND created_at >= $${paramIndex}`;
        params.push(fromDate);
        paramIndex++;
      }

      if (toDate) {
        query += ` AND created_at <= $${paramIndex}`;
        params.push(toDate);
        paramIndex++;
      }

      query += ` ORDER BY created_at DESC LIMIT $${paramIndex}`;
      params.push(limit);

      const result = await db.query(query, params);

      return new Response(JSON.stringify(result.rows), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: (error as Error).message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  // GET /api/content/:id - Get single content with chat history
  if (req.method === "GET" && pathParts.length === 3) {
    try {
      const id = pathParts[2];
      const result = await db.query("SELECT * FROM content WHERE id = $1", [id]);

      if (result.rows.length === 0) {
        return new Response(JSON.stringify({ error: "Content not found" }), {
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

  // PUT /api/content/:id - Update content manually
  if (req.method === "PUT" && pathParts.length === 3) {
    try {
      const id = pathParts[2];
      const body = await req.json();
      const { edited_content } = body;

      if (!edited_content) {
        return new Response(
          JSON.stringify({ error: "Missing required field: edited_content" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      const result = await db.query(
        `UPDATE content 
         SET edited_content = $1
         WHERE id = $2 
         RETURNING *`,
        [edited_content, id]
      );

      if (result.rows.length === 0) {
        return new Response(JSON.stringify({ error: "Content not found" }), {
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

  // DELETE /api/content/:id - Delete content
  if (req.method === "DELETE" && pathParts.length === 3) {
    try {
      const id = pathParts[2];
      const result = await db.query("DELETE FROM content WHERE id = $1 RETURNING id", [id]);

      if (result.rows.length === 0) {
        return new Response(JSON.stringify({ error: "Content not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: (error as Error).message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  // POST /api/content/:id/chat - Chat with AI to edit content
  if (req.method === "POST" && pathParts.length === 4 && pathParts[3] === "chat") {
    try {
      const id = pathParts[2];
      const body = await req.json();
      const { message } = body;

      if (!message) {
        return new Response(
          JSON.stringify({ error: "Missing required field: message" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      // Get content with chat history
      const contentResult = await db.query("SELECT * FROM content WHERE id = $1", [id]);

      if (contentResult.rows.length === 0) {
        return new Response(JSON.stringify({ error: "Content not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }

      const content = contentResult.rows[0] as any;
      const chatHistory = content.chat_history || [];

      // Get AI config
      const configResult = await db.query("SELECT * FROM ai_config WHERE id = 1");
      const aiConfig = configResult.rows[0] as any;

      // Build conversation context
      const currentContent = content.edited_content || content.content;
      const systemPrompt = `You are helping edit and refine content. The current content is:\n\n${currentContent}\n\nHelp the user make improvements based on their requests.`;

      // Construct messages array with chat history
      const messages = [
        { role: "system", content: systemPrompt },
        ...chatHistory,
        { role: "user", content: message },
      ];

      // Build the full user prompt for OpenRouter
      let conversationText = systemPrompt + "\n\n";
      for (const msg of chatHistory) {
        conversationText += `${msg.role}: ${msg.content}\n\n`;
      }
      conversationText += `user: ${message}`;

      // Call OpenRouter
      const aiResponse = await openrouterIntegration.execute({
        model: aiConfig.model,
        systemPrompt: systemPrompt,
        userPrompt: conversationText,
        temperature: aiConfig.temperature,
      });

      // Update chat history
      const updatedChatHistory = [
        ...chatHistory,
        { role: "user", content: message },
        { role: "assistant", content: aiResponse.content },
      ];

      // Update content with new chat history and optionally edited content
      const updateResult = await db.query(
        `UPDATE content 
         SET chat_history = $1, edited_content = $2
         WHERE id = $3 
         RETURNING *`,
        [JSON.stringify(updatedChatHistory), aiResponse.content, id]
      );

      return new Response(JSON.stringify({
        content: updateResult.rows[0],
        response: aiResponse.content,
      }), {
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
