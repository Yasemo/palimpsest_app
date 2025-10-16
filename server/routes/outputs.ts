import { db } from "../db/client.ts";
import { gmailIntegration } from "../integrations/gmail.ts";

export async function handleOutputsRoutes(req: Request, pathname: string): Promise<Response> {
  const url = new URL(req.url);
  const pathParts = pathname.split("/").filter(Boolean);

  // GET /api/outputs - List all outputs
  if (req.method === "GET" && pathParts.length === 2) {
    try {
      const result = await db.query(
        "SELECT * FROM outputs ORDER BY created_at DESC"
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

  // POST /api/outputs - Create output
  if (req.method === "POST" && pathParts.length === 2) {
    try {
      const body = await req.json();
      const { name, type, config, schedule, active = true } = body;

      if (!name || !type || !config) {
        return new Response(
          JSON.stringify({ error: "Missing required fields: name, type, config" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      const result = await db.query(
        `INSERT INTO outputs (name, type, config, schedule, active) 
         VALUES ($1, $2, $3, $4, $5) 
         RETURNING *`,
        [name, type, JSON.stringify(config), schedule, active]
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

  // GET /api/outputs/:id - Get single output
  if (req.method === "GET" && pathParts.length === 3) {
    try {
      const id = pathParts[2];
      const result = await db.query("SELECT * FROM outputs WHERE id = $1", [id]);

      if (result.rows.length === 0) {
        return new Response(JSON.stringify({ error: "Output not found" }), {
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

  // PUT /api/outputs/:id - Update output
  if (req.method === "PUT" && pathParts.length === 3) {
    try {
      const id = pathParts[2];
      const body = await req.json();
      const { name, type, config, schedule, active } = body;

      const result = await db.query(
        `UPDATE outputs 
         SET name = COALESCE($1, name), 
             type = COALESCE($2, type), 
             config = COALESCE($3, config), 
             schedule = COALESCE($4, schedule), 
             active = COALESCE($5, active)
         WHERE id = $6 
         RETURNING *`,
        [name, type, config ? JSON.stringify(config) : null, schedule, active, id]
      );

      if (result.rows.length === 0) {
        return new Response(JSON.stringify({ error: "Output not found" }), {
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

  // DELETE /api/outputs/:id - Delete output
  if (req.method === "DELETE" && pathParts.length === 3) {
    try {
      const id = pathParts[2];
      const result = await db.query("DELETE FROM outputs WHERE id = $1 RETURNING id", [id]);

      if (result.rows.length === 0) {
        return new Response(JSON.stringify({ error: "Output not found" }), {
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

  // POST /api/outputs/:id/execute - Execute output manually
  if (req.method === "POST" && pathParts.length === 4 && pathParts[3] === "execute") {
    try {
      const id = pathParts[2];
      const outputResult = await db.query("SELECT * FROM outputs WHERE id = $1", [id]);

      if (outputResult.rows.length === 0) {
        return new Response(JSON.stringify({ error: "Output not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }

      const output = outputResult.rows[0] as any;
      const outputConfig = output.config;

      // Get content based on date filters
      const fromDate = outputConfig.from_date || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const toDate = outputConfig.to_date || new Date().toISOString();

      const contentQuery = await db.query(
        `SELECT * FROM content 
         WHERE created_at >= $1 AND created_at <= $2 
         ORDER BY created_at DESC`,
        [fromDate, toDate]
      );

      const contentItems = contentQuery.rows;
      const contentIds: number[] = [];
      const results: any[] = [];

      // Process each content item based on output type
      if (output.type === "gmail") {
        for (const content of contentItems) {
          const contentData = content as any;
          contentIds.push(contentData.id);

          try {
            // Use edited_content if available, otherwise use original content
            const emailBody = contentData.edited_content || contentData.content;
            
            const gmailResult = await gmailIntegration.execute({
              to: outputConfig.recipient || "default@example.com",
              subject: outputConfig.subject || "Content from Palimpsest",
              body: emailBody,
              contentType: outputConfig.content_type || "text/plain",
            });

            results.push({ contentId: contentData.id, success: true, result: gmailResult });
          } catch (error) {
            results.push({ contentId: contentData.id, success: false, error: (error as Error).message });
          }
        }
      }

      // Log the output execution
      const logResult = await db.query(
        `INSERT INTO output_logs (output_id, content_ids, status, details) 
         VALUES ($1, $2, $3, $4) 
         RETURNING *`,
        [id, contentIds, "success", JSON.stringify(results)]
      );

      return new Response(JSON.stringify({
        log: logResult.rows[0],
        results: results,
        contentCount: contentIds.length,
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

  // GET /api/outputs/:id/logs - Get output execution logs
  if (req.method === "GET" && pathParts.length === 4 && pathParts[3] === "logs") {
    try {
      const id = pathParts[2];
      const limit = url.searchParams.get("limit") || "50";
      
      const result = await db.query(
        `SELECT * FROM output_logs 
         WHERE output_id = $1 
         ORDER BY executed_at DESC 
         LIMIT $2`,
        [id, limit]
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

  return new Response(JSON.stringify({ error: "Not found" }), {
    status: 404,
    headers: { "Content-Type": "application/json" },
  });
}
