import { db } from "../db/client.ts";
import { openrouterIntegration } from "../integrations/openrouter.ts";
import { config } from "../config.ts";

export async function handleContentRoutes(req: Request, pathname: string): Promise<Response> {
  const url = new URL(req.url);
  const pathParts = pathname.split("/").filter(Boolean);

  // GET /api/content/:id/tags - Get tags for content
  if (req.method === "GET" && pathParts.length === 4 && pathParts[1] === "content" && pathParts[3] === "tags") {
    try {
      const contentId = pathParts[2];
      const result = await db.query(
        `SELECT t.* FROM tags t
         INNER JOIN content_tags ct ON t.id = ct.tag_id
         WHERE ct.content_id = $1
         ORDER BY t.name ASC`,
        [contentId]
      );

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

  // POST /api/content/:id/tags - Set tags for content
  if (req.method === "POST" && pathParts.length === 4 && pathParts[1] === "content" && pathParts[3] === "tags") {
    try {
      const contentId = pathParts[2];
      const body = await req.json();
      const { tag_ids } = body;

      if (!Array.isArray(tag_ids)) {
        return new Response(
          JSON.stringify({ error: "tag_ids must be an array" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      // Delete existing tags
      await db.query("DELETE FROM content_tags WHERE content_id = $1", [contentId]);

      // Insert new tags
      if (tag_ids.length > 0) {
        const values = tag_ids.map((_tagId: any, i: number) => `($1, $${i + 2})`).join(", ");
        const params = [contentId, ...tag_ids];
        await db.query(
          `INSERT INTO content_tags (content_id, tag_id) VALUES ${values}`,
          params
        );
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

  // GET /api/content/editor-config - Get content editor default model
  if (req.method === "GET" && pathParts.length === 3 && pathParts[2] === "editor-config") {
    return new Response(JSON.stringify({
      defaultModel: config.ai.defaultContentEditorModel
    }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // POST /api/content - Create new content directly
  if (req.method === "POST" && pathParts.length === 2) {
    try {
      const body = await req.json();
      const { content } = body;

      if (!content) {
        return new Response(
          JSON.stringify({ error: "Missing required field: content" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      const result = await db.query(
        `INSERT INTO content (content, created_at)
         VALUES ($1, NOW())
         RETURNING *`,
        [content]
      );

      return new Response(JSON.stringify(result.rows[0]), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: (error as Error).message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

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
      const { message, currentContent, model } = body;

      if (!message || !currentContent) {
        return new Response(
          JSON.stringify({ error: "Missing required fields: message, currentContent" }),
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

      // Get AI config for temperature and fallback model
      const configResult = await db.query("SELECT * FROM ai_config WHERE id = 1");
      const aiConfig = configResult.rows[0] as any;

      // Use provided model or fall back to config
      const modelToUse = model || aiConfig.model;

      // Build system prompt with current content state
      const systemPrompt = `You are an AI assistant helping the user refine and improve their content. The user is currently working on the following content:

---
${currentContent}
---

Provide helpful suggestions, edits, and improvements based on the user's requests. Be concise and actionable.`;

      // Build conversation history for context
      let conversationText = "";
      for (const msg of chatHistory) {
        conversationText += `${msg.role}: ${msg.content}\n\n`;
      }
      conversationText += `user: ${message}`;

      // Call OpenRouter with current content context
      const aiResponse = await openrouterIntegration.execute({
        model: modelToUse,
        systemPrompt: systemPrompt,
        userPrompt: conversationText,
        temperature: aiConfig.temperature || 0.7,
      });

      // Update chat history only (don't modify content)
      const updatedChatHistory = [
        ...chatHistory,
        { role: "user", content: message },
        { role: "assistant", content: aiResponse.content },
      ];

      // Save chat history to database
      await db.query(
        `UPDATE content SET chat_history = $1 WHERE id = $2`,
        [JSON.stringify(updatedChatHistory), id]
      );

      return new Response(JSON.stringify({
        response: aiResponse.content,
        chatHistory: updatedChatHistory,
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

  // POST /api/content/:id/clear-chat - Clear chat history
  if (req.method === "POST" && pathParts.length === 4 && pathParts[3] === "clear-chat") {
    try {
      const id = pathParts[2];

      // Clear chat history by setting it to empty array
      const result = await db.query(
        `UPDATE content SET chat_history = $1 WHERE id = $2 RETURNING *`,
        [JSON.stringify([]), id]
      );

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

  // POST /api/content/:id/save-variant - Save current content as a new content card
  if (req.method === "POST" && pathParts.length === 4 && pathParts[3] === "save-variant") {
    try {
      const id = pathParts[2];
      const body = await req.json();
      const { content: newContent } = body;

      if (!newContent) {
        return new Response(
          JSON.stringify({ error: "Missing required field: content" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      // Get original content for reference
      const originalResult = await db.query("SELECT * FROM content WHERE id = $1", [id]);

      if (originalResult.rows.length === 0) {
        return new Response(JSON.stringify({ error: "Original content not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Create new content card
      const result = await db.query(
        `INSERT INTO content (content, source_content_id, created_at)
         VALUES ($1, $2, NOW())
         RETURNING *`,
        [newContent, id]
      );

      return new Response(JSON.stringify(result.rows[0]), {
        status: 201,
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
