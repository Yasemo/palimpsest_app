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

      // Calculate next_run_at if schedule is provided
      let nextRunAt = null;
      if (schedule) {
        const { parseScheduleAndGetNextRun } = await import("../schedulers/utils.ts");
        const scheduleInfo = parseScheduleAndGetNextRun(schedule);
        nextRunAt = scheduleInfo.nextRunAt;
      }

      const result = await db.query(
        `INSERT INTO outputs (name, type, config, schedule, active, next_run_at) 
         VALUES ($1, $2, $3, $4, $5, $6) 
         RETURNING *`,
        [name, type, JSON.stringify(config), schedule, active, nextRunAt]
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

      // Calculate next_run_at if schedule is being updated
      let nextRunAt = undefined;
      if (schedule !== undefined) {
        if (schedule) {
          const { parseScheduleAndGetNextRun } = await import("../schedulers/utils.ts");
          const scheduleInfo = parseScheduleAndGetNextRun(schedule);
          nextRunAt = scheduleInfo.nextRunAt;
        } else {
          nextRunAt = null;
        }
      }

      const result = await db.query(
        `UPDATE outputs 
         SET name = COALESCE($1, name), 
             type = COALESCE($2, type), 
             config = COALESCE($3, config), 
             schedule = COALESCE($4, schedule), 
             active = COALESCE($5, active),
             next_run_at = COALESCE($7, next_run_at)
         WHERE id = $6 
         RETURNING *`,
        [name, type, config ? JSON.stringify(config) : null, schedule, active, id, nextRunAt]
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

      // Get tag IDs for this output
      const tagResult = await db.query(
        "SELECT tag_id FROM output_tags WHERE output_id = $1",
        [id]
      );
      const tagIds = tagResult.rows.map((row: any) => row.tag_id);

      // Calculate cutoff date based on config
      let cutoffDate: Date;
      const cutoffDays = outputConfig.cutoff_days;
      
      if (cutoffDays === -1) {
        // All time
        cutoffDate = new Date(0);
      } else if (cutoffDays) {
        cutoffDate = new Date(Date.now() - cutoffDays * 24 * 60 * 60 * 1000);
      } else {
        // Default to last 7 days
        cutoffDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      }

      // Query content based on tags and date cutoff
      let contentQuery;
      if (tagIds.length > 0) {
        // Build placeholders for tag IDs
        const tagPlaceholders = tagIds.map((_: any, i: number) => `$${i + 2}`).join(',');
        
        // Filter by tags (OR logic - content with ANY of the tags)
        contentQuery = await db.query(
          `SELECT DISTINCT c.* FROM content c
           JOIN content_tags ct ON c.id = ct.content_id
           WHERE ct.tag_id IN (${tagPlaceholders})
           AND c.created_at >= $1
           ORDER BY c.created_at DESC`,
          [cutoffDate.toISOString(), ...tagIds]
        );
      } else {
        // No tags specified - get all content within date range
        contentQuery = await db.query(
          `SELECT * FROM content 
           WHERE created_at >= $1
           ORDER BY created_at DESC`,
          [cutoffDate.toISOString()]
        );
      }

      const contentItems = contentQuery.rows;
      const contentIds: number[] = [];

      // Combine content items
      const contentSeparator = outputConfig.content_separator || "\n\n---\n\n";
      const includeMetadata = outputConfig.include_metadata !== false;
      
      let combinedContent = "";
      
      for (const content of contentItems) {
        const contentData = content as any;
        contentIds.push(contentData.id);
        
        // Use edited_content if available, otherwise use original content
        const contentText = contentData.edited_content || contentData.content;
        
        if (includeMetadata) {
          const dateStr = new Date(contentData.created_at).toLocaleString();
          combinedContent += `[${dateStr}]\n\n${contentText}${contentSeparator}`;
        } else {
          combinedContent += `${contentText}${contentSeparator}`;
        }
      }

      // Remove trailing separator
      if (combinedContent.endsWith(contentSeparator)) {
        combinedContent = combinedContent.slice(0, -contentSeparator.length);
      }

      const results: any[] = [];

      // Process based on output type
      if (output.type === "gmail") {
        try {
          // Handle both old (recipient) and new (recipients) formats
          const recipients = outputConfig.recipients || [outputConfig.recipient || "default@example.com"];
          const toField = recipients.join(', ');
          
          console.log('[Output Execute] Sending styled email to:', toField);
          console.log('[Output Execute] Content items count:', contentItems.length);
          
          // Prepare content items with dates and citations for HTML template
          const contentItemsForEmail: Array<{content: string, date: string, citations: string[]}> = [];
          
          for (const content of contentItems) {
            const contentData = content as any;
            const contentText = contentData.edited_content || contentData.content;
            const dateStr = new Date(contentData.created_at).toLocaleString();
            const citations = contentData.citations || [];
            
            contentItemsForEmail.push({
              content: contentText,
              date: dateStr,
              citations: citations
            });
          }
          
          console.log('[Output Execute] Content items for email:', contentItemsForEmail.length);
          if (contentItemsForEmail.length === 0) {
            console.log('[Output Execute] WARNING: No content items to send!');
          }
          
          // Use styled HTML email with output title
          const gmailResult = await gmailIntegration.sendStyledEmail({
            to: toField,
            subject: outputConfig.subject || "Content from Palimpsest",
            contentItems: contentItemsForEmail,
            labels: outputConfig.labels || [],
            outputTitle: output.name, // Pass the output name as the title
          });

          results.push({ success: true, result: gmailResult });
        } catch (error) {
          results.push({ success: false, error: (error as Error).message });
        }
      }

      // Log the output execution with combined content
      // Format contentIds as PostgreSQL array literal
      const pgArrayFormat = contentIds.length > 0 ? `{${contentIds.join(',')}}` : '{}';
      
      const logResult = await db.query(
        `INSERT INTO output_logs (output_id, content_ids, status, details, output_content) 
         VALUES ($1, $2, $3, $4, $5) 
         RETURNING *`,
        [id, pgArrayFormat, "success", JSON.stringify(results), combinedContent]
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

  // GET /api/outputs/:id/tags - Get tags for an output
  if (req.method === "GET" && pathParts.length === 4 && pathParts[3] === "tags") {
    try {
      const id = pathParts[2];
      const result = await db.query(
        `SELECT t.* FROM tags t
         JOIN output_tags ot ON t.id = ot.tag_id
         WHERE ot.output_id = $1
         ORDER BY t.name`,
        [id]
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

  // POST /api/outputs/:id/tags - Set tags for an output
  if (req.method === "POST" && pathParts.length === 4 && pathParts[3] === "tags") {
    try {
      const id = pathParts[2];
      const body = await req.json();
      const { tag_ids } = body;

      if (!Array.isArray(tag_ids)) {
        return new Response(
          JSON.stringify({ error: "tag_ids must be an array" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      // Delete existing tags
      await db.query("DELETE FROM output_tags WHERE output_id = $1", [id]);

      // Insert new tags
      for (const tagId of tag_ids) {
        await db.query(
          "INSERT INTO output_tags (output_id, tag_id) VALUES ($1, $2)",
          [id, tagId]
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

  // POST /api/outputs/preview - Preview content that will be included
  if (req.method === "POST" && pathParts.length === 3 && pathParts[2] === "preview") {
    try {
      const body = await req.json();
      const { tag_ids = [], cutoff_days = 7 } = body;

      // Calculate cutoff date
      let cutoffDate: Date;
      if (cutoff_days === -1) {
        cutoffDate = new Date(0);
      } else {
        cutoffDate = new Date(Date.now() - cutoff_days * 24 * 60 * 60 * 1000);
      }

      // Query content based on tags and date cutoff
      let contentQuery;
      if (tag_ids.length > 0) {
        // Build placeholders for tag IDs
        const tagPlaceholders = tag_ids.map((_: any, i: number) => `$${i + 2}`).join(',');
        
        contentQuery = await db.query(
          `SELECT DISTINCT c.*, 
           ARRAY_AGG(DISTINCT t.id) as tag_ids,
           ARRAY_AGG(DISTINCT t.name) as tag_names,
           ARRAY_AGG(DISTINCT t.color) as tag_colors
           FROM content c
           JOIN content_tags ct ON c.id = ct.content_id
           LEFT JOIN tags t ON ct.tag_id = t.id
           WHERE ct.tag_id IN (${tagPlaceholders})
           AND c.created_at >= $1
           GROUP BY c.id
           ORDER BY c.created_at DESC
           LIMIT 50`,
          [cutoffDate.toISOString(), ...tag_ids]
        );
      } else {
        contentQuery = await db.query(
          `SELECT c.*,
           ARRAY_AGG(DISTINCT t.id) as tag_ids,
           ARRAY_AGG(DISTINCT t.name) as tag_names,
           ARRAY_AGG(DISTINCT t.color) as tag_colors
           FROM content c
           LEFT JOIN content_tags ct ON c.id = ct.content_id
           LEFT JOIN tags t ON ct.tag_id = t.id
           WHERE c.created_at >= $1
           GROUP BY c.id
           ORDER BY c.created_at DESC
           LIMIT 50`,
          [cutoffDate.toISOString()]
        );
      }

      return new Response(JSON.stringify({
        content: contentQuery.rows,
        count: contentQuery.rows.length
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
