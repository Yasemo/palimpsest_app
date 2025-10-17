import { db } from "../db/client.ts";
import { processInfoPackageWithAI } from "../schedulers/utils.ts";
import { openrouterIntegration } from "../integrations/openrouter.ts";

export async function handleQueriesRoutes(req: Request, pathname: string): Promise<Response> {
  const url = new URL(req.url);
  const pathParts = pathname.split("/").filter(Boolean);

  // GET /api/queries/:id/tags - Get tags for a query
  if (req.method === "GET" && pathParts.length === 4 && pathParts[1] === "queries" && pathParts[3] === "tags") {
    try {
      const queryId = pathParts[2];
      const result = await db.query(
        `SELECT t.* FROM tags t
         INNER JOIN query_tags qt ON t.id = qt.tag_id
         WHERE qt.query_id = $1
         ORDER BY t.name ASC`,
        [queryId]
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

  // POST /api/queries/:id/tags - Set tags for a query
  if (req.method === "POST" && pathParts.length === 4 && pathParts[1] === "queries" && pathParts[3] === "tags") {
    try {
      const queryId = pathParts[2];
      const body = await req.json();
      const { tag_ids } = body;

      if (!Array.isArray(tag_ids)) {
        return new Response(
          JSON.stringify({ error: "tag_ids must be an array" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      // Delete existing tags
      await db.query("DELETE FROM query_tags WHERE query_id = $1", [queryId]);

      // Insert new tags
      if (tag_ids.length > 0) {
        const values = tag_ids.map((_tagId: any, i: number) => `($1, $${i + 2})`).join(", ");
        const params = [queryId, ...tag_ids];
        await db.query(
          `INSERT INTO query_tags (query_id, tag_id) VALUES ${values}`,
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

  // GET /api/info-packages/:id/tags - Get tags for an info package
  if (req.method === "GET" && pathParts.length === 4 && pathParts[1] === "info-packages" && pathParts[3] === "tags") {
    try {
      const packageId = pathParts[2];
      const result = await db.query(
        `SELECT t.* FROM tags t
         INNER JOIN info_package_tags ipt ON t.id = ipt.tag_id
         WHERE ipt.info_package_id = $1
         ORDER BY t.name ASC`,
        [packageId]
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

  // POST /api/info-packages/:id/tags - Set tags for an info package
  if (req.method === "POST" && pathParts.length === 4 && pathParts[1] === "info-packages" && pathParts[3] === "tags") {
    try {
      const packageId = pathParts[2];
      const body = await req.json();
      const { tag_ids } = body;

      if (!Array.isArray(tag_ids)) {
        return new Response(
          JSON.stringify({ error: "tag_ids must be an array" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      // Delete existing tags
      await db.query("DELETE FROM info_package_tags WHERE info_package_id = $1", [packageId]);

      // Insert new tags
      if (tag_ids.length > 0) {
        const values = tag_ids.map((_tagId: any, i: number) => `($1, $${i + 2})`).join(", ");
        const params = [packageId, ...tag_ids];
        await db.query(
          `INSERT INTO info_package_tags (info_package_id, tag_id) VALUES ${values}`,
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

  // GET /api/queries - List all queries
  if (req.method === "GET" && pathParts.length === 2 && pathParts[1] === "queries") {
    try {
      const result = await db.query(
        "SELECT * FROM queries ORDER BY created_at DESC"
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

  // POST /api/info-packages - Create info package directly (check before POST /api/queries)
  if (req.method === "POST" && pathname === "/api/info-packages") {
    try {
      const body = await req.json();
      const { query_id, data, directive } = body;

      if (!query_id || !data || !directive) {
        return new Response(
          JSON.stringify({ error: "Missing required fields: query_id, data, directive" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      const result = await db.query(
        `INSERT INTO info_packages (query_id, data, directive, processed) 
         VALUES ($1, $2, $3, false) 
         RETURNING *`,
        [query_id, data, directive]
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

  // POST /api/queries - Create query
  if (req.method === "POST" && pathParts.length === 2 && pathParts[1] === "queries") {
    try {
      const body = await req.json();
      const { name, query_config, directive, schedule, next_run_at, active = true, auto_process_with_ai = false } = body;

      if (!name || !query_config || !directive) {
        return new Response(
          JSON.stringify({ error: "Missing required fields: name, query_config, directive" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      const result = await db.query(
        `INSERT INTO queries (name, query_config, directive, schedule, next_run_at, active, auto_process_with_ai) 
         VALUES ($1, $2, $3, $4, $5, $6, $7) 
         RETURNING *`,
        [name, JSON.stringify(query_config), directive, schedule, next_run_at, active, auto_process_with_ai]
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

  // GET /api/info-packages/:id - Get single info package (check before GET /api/queries/:id)
  if (req.method === "GET" && pathParts[1] === "info-packages" && pathParts.length === 3) {
    try {
      const id = pathParts[2];
      const result = await db.query(
        `SELECT ip.*, q.name as query_name, q.directive as query_directive
         FROM info_packages ip
         LEFT JOIN queries q ON ip.query_id = q.id
         WHERE ip.id = $1`,
        [id]
      );

      if (result.rows.length === 0) {
        return new Response(JSON.stringify({ error: "Info package not found" }), {
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

  // GET /api/queries/:id - Get single query
  if (req.method === "GET" && pathParts.length === 3 && pathParts[1] === "queries") {
    try {
      const id = pathParts[2];
      const result = await db.query("SELECT * FROM queries WHERE id = $1", [id]);

      if (result.rows.length === 0) {
        return new Response(JSON.stringify({ error: "Query not found" }), {
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

  // PUT /api/queries/:id - Update query
  if (req.method === "PUT" && pathParts.length === 3 && pathParts[1] === "queries") {
    try {
      const id = pathParts[2];
      const body = await req.json();
      const { name, query_config, directive, schedule, next_run_at, active, auto_process_with_ai } = body;

      const result = await db.query(
        `UPDATE queries 
         SET name = COALESCE($1, name), 
             query_config = COALESCE($2, query_config), 
             directive = COALESCE($3, directive), 
             schedule = COALESCE($4, schedule), 
             next_run_at = COALESCE($5, next_run_at),
             active = COALESCE($6, active),
             auto_process_with_ai = COALESCE($7, auto_process_with_ai)
         WHERE id = $8 
         RETURNING *`,
        [name, query_config ? JSON.stringify(query_config) : null, directive, schedule, next_run_at, active, auto_process_with_ai, id]
      );

      if (result.rows.length === 0) {
        return new Response(JSON.stringify({ error: "Query not found" }), {
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

  // DELETE /api/queries/:id - Delete query
  if (req.method === "DELETE" && pathParts.length === 3 && pathParts[1] === "queries") {
    try {
      const id = pathParts[2];
      const result = await db.query("DELETE FROM queries WHERE id = $1 RETURNING id", [id]);

      if (result.rows.length === 0) {
        return new Response(JSON.stringify({ error: "Query not found" }), {
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

  // POST /api/queries/:id/execute - Execute query manually
  if (req.method === "POST" && pathParts.length === 4 && pathParts[3] === "execute") {
    try {
      const id = pathParts[2];
      console.log(`[Query Execute] Starting execution for query ID: ${id}`);
      
      const queryResult = await db.query("SELECT * FROM queries WHERE id = $1", [id]);

      if (queryResult.rows.length === 0) {
        console.error(`[Query Execute] Query not found: ${id}`);
        return new Response(JSON.stringify({ error: "Query not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }

      const query = queryResult.rows[0] as any;
      const queryConfig = query.query_config;

      console.log(`[Query Execute] Query details:`, {
        id: query.id,
        name: query.name,
        auto_process_with_ai: query.auto_process_with_ai
      });

      // Get source IDs from query config
      const sourceIds = queryConfig.sources || [];
      
      console.log(`[Query Execute] Source IDs to execute:`, sourceIds);
      
      if (sourceIds.length === 0) {
        console.warn(`[Query Execute] No sources configured for query ${id}`);
        return new Response(
          JSON.stringify({ error: "No sources configured for this query" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      // Fetch all sources
      const placeholders = sourceIds.map((_: any, i: number) => `$${i + 1}`).join(',');
      const sourcesResult = await db.query(
        `SELECT * FROM sources WHERE id IN (${placeholders})`,
        sourceIds
      );

      const sources = sourcesResult.rows as any[];
      console.log(`[Query Execute] Found ${sources.length} sources to execute`);
      
      const sourceResults: any[] = [];

      // Execute each source sequentially
      for (const source of sources) {
        console.log(`[Query Execute] Executing source ${source.id} (${source.name})`);
        
        try {
          // Execute source via its execute endpoint logic
          const response = await fetch(
            `${url.origin}/api/sources/${source.id}/execute`,
            { method: "POST" }
          );
          
          const result = await response.json();
          
          console.log(`[Query Execute] Source ${source.id} execution completed with status: ${result.status}`);
          
          // Extract the actual integration data from the source_results DB row
          // The 'data' field contains the stringified integration result with citations
          let integrationData;
          try {
            integrationData = typeof result.data === 'string' ? JSON.parse(result.data) : result.data;
            
            // Log if citations are present
            if (integrationData.citations && integrationData.citations.length > 0) {
              console.log(`[Query Execute] Source ${source.id} returned ${integrationData.citations.length} citations`);
            }
          } catch (parseError) {
            console.error(`[Query Execute] Failed to parse source result data for source ${source.id}:`, parseError);
            integrationData = result.data;
          }
          
          sourceResults.push({
            sourceId: source.id,
            sourceName: source.name,
            sourceType: source.type,
            data: integrationData,  // Store the parsed integration data with citations
            status: result.status || (response.ok ? "success" : "error"),
            executedAt: new Date().toISOString()
          });
        } catch (error) {
          console.error(`[Query Execute] Source ${source.id} execution failed:`, (error as Error).message);
          
          sourceResults.push({
            sourceId: source.id,
            sourceName: source.name,
            sourceType: source.type,
            data: { error: (error as Error).message },
            status: "error",
            executedAt: new Date().toISOString()
          });
        }
      }

      // Create info package with aggregated results
      const packageData = {
        sources: sourceResults,
        queryTitle: query.name,
        executionSummary: {
          totalSources: sources.length,
          successCount: sourceResults.filter(r => r.status === "success").length,
          errorCount: sourceResults.filter(r => r.status === "error").length,
        }
      };

      const packageResult = await db.query(
        `INSERT INTO info_packages (query_id, data, directive, processed) 
         VALUES ($1, $2, $3, false) 
         RETURNING *`,
        [id, packageData, query.directive]
      );

      const infoPackage = packageResult.rows[0] as any;

      // Copy tags from query to info package
      const tagsResult = await db.query(
        `SELECT tag_id FROM query_tags WHERE query_id = $1`,
        [id]
      );

      if (tagsResult.rows.length > 0) {
        const tagIds = tagsResult.rows.map((row: any) => row.tag_id);
        const values = tagIds.map((_tagId: any, i: number) => `($1, $${i + 2})`).join(", ");
        const params = [infoPackage.id, ...tagIds];
        await db.query(
          `INSERT INTO info_package_tags (info_package_id, tag_id) VALUES ${values}`,
          params
        );
      }

      // Check if auto-process with AI is enabled
      console.log(`[MANUAL-EXEC] Query ${id} auto_process_with_ai setting: ${query.auto_process_with_ai}`);
      if (query.auto_process_with_ai) {
        console.log(`[MANUAL-EXEC] Auto-processing enabled, triggering AI processing for info package ${infoPackage.id}`);
        try {
          const content = await processInfoPackageWithAI(db, infoPackage.id, openrouterIntegration);
          console.log(`[MANUAL-EXEC] Auto-processing successful, content ID: ${content.id}`);
          return new Response(JSON.stringify({
            infoPackage,
            content,
            autoProcessed: true
          }), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (error) {
          console.error(`[MANUAL-EXEC] Failed to auto-process info package ${infoPackage.id}:`, error);
          // Return the info package anyway, but note the processing failed
          return new Response(JSON.stringify({
            infoPackage,
            autoProcessed: false,
            autoProcessError: (error as Error).message
          }), {
            headers: { "Content-Type": "application/json" },
          });
        }
      } else {
        console.log(`[MANUAL-EXEC] Auto-processing disabled, returning info package ${infoPackage.id} only`);
      }

      return new Response(JSON.stringify(infoPackage), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: (error as Error).message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  // GET /api/queries/:id/packages - Get info packages for query
  if (req.method === "GET" && pathParts.length === 4 && pathParts[3] === "packages") {
    try {
      const id = pathParts[2];
      const limit = url.searchParams.get("limit") || "50";
      
      const result = await db.query(
        `SELECT * FROM info_packages 
         WHERE query_id = $1 
         ORDER BY created_at DESC 
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

  // GET /api/info-packages - Get all info packages
  if (req.method === "GET" && pathname === "/api/info-packages") {
    try {
      const limit = url.searchParams.get("limit") || "50";
      const offset = url.searchParams.get("offset") || "0";
      
      const result = await db.query(
        `SELECT ip.*, q.name as query_name 
         FROM info_packages ip
         LEFT JOIN queries q ON ip.query_id = q.id
         ORDER BY ip.created_at DESC 
         LIMIT $1 OFFSET $2`,
        [limit, offset]
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

  // PUT /api/info-packages/:id - Update info package
  if (req.method === "PUT" && pathParts[1] === "info-packages" && pathParts.length === 3) {
    try {
      const id = pathParts[2];
      const body = await req.json();
      const { directive } = body;

      if (!directive) {
        return new Response(
          JSON.stringify({ error: "Directive is required" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      const result = await db.query(
        `UPDATE info_packages 
         SET directive = $1 
         WHERE id = $2 
         RETURNING *`,
        [directive, id]
      );

      if (result.rows.length === 0) {
        return new Response(JSON.stringify({ error: "Info package not found" }), {
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

  // DELETE /api/info-packages/:id - Delete info package
  if (req.method === "DELETE" && pathParts[1] === "info-packages" && pathParts.length === 3) {
    try {
      const id = pathParts[2];
      
      // Delete directly without checking if query exists
      // (query may have been deleted already due to CASCADE)
      const result = await db.query(
        "DELETE FROM info_packages WHERE id = $1 RETURNING id",
        [id]
      );

      if (result.rows.length === 0) {
        return new Response(JSON.stringify({ error: "Info package not found" }), {
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

  return new Response(JSON.stringify({ error: "Not found" }), {
    status: 404,
    headers: { "Content-Type": "application/json" },
  });
}
