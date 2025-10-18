import { db } from "../db/client.ts";
import { perplexityIntegration } from "../integrations/perplexity.ts";
import { airtableIntegration } from "../integrations/airtable.ts";

export async function handleSourcesRoutes(req: Request, pathname: string): Promise<Response> {
  const url = new URL(req.url);
  const pathParts = pathname.split("/").filter(Boolean);

  // GET /api/sources - List all sources
  if (req.method === "GET" && pathParts.length === 2) {
    try {
      const result = await db.query(
        "SELECT * FROM sources ORDER BY created_at DESC"
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

  // POST /api/sources - Create source
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
        `INSERT INTO sources (name, type, config, schedule, active) 
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

  // GET /api/sources/:id - Get single source
  if (req.method === "GET" && pathParts.length === 3) {
    try {
      const id = pathParts[2];
      const result = await db.query("SELECT * FROM sources WHERE id = $1", [id]);

      if (result.rows.length === 0) {
        return new Response(JSON.stringify({ error: "Source not found" }), {
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

  // PUT /api/sources/:id - Update source
  if (req.method === "PUT" && pathParts.length === 3) {
    try {
      const id = pathParts[2];
      const body = await req.json();
      const { name, type, config, schedule, active } = body;

      const result = await db.query(
        `UPDATE sources 
         SET name = COALESCE($1, name), 
             type = COALESCE($2, type), 
             config = COALESCE($3, config), 
             schedule = COALESCE($4, schedule), 
             active = COALESCE($5, active)
         WHERE id = $6 
         RETURNING *`,
        [
          name ?? null,
          type ?? null,
          config ? JSON.stringify(config) : null,
          schedule ?? null,
          active ?? null,
          id
        ]
      );

      if (result.rows.length === 0) {
        return new Response(JSON.stringify({ error: "Source not found" }), {
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

  // DELETE /api/sources/:id - Delete source
  if (req.method === "DELETE" && pathParts.length === 3) {
    try {
      const id = pathParts[2];
      const result = await db.query("DELETE FROM sources WHERE id = $1 RETURNING id", [id]);

      if (result.rows.length === 0) {
        return new Response(JSON.stringify({ error: "Source not found" }), {
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

  // POST /api/sources/:id/execute - Execute source manually
  if (req.method === "POST" && pathParts.length === 4 && pathParts[3] === "execute") {
    try {
      const id = pathParts[2];
      const sourceResult = await db.query("SELECT * FROM sources WHERE id = $1", [id]);

      if (sourceResult.rows.length === 0) {
        return new Response(JSON.stringify({ error: "Source not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }

      const source = sourceResult.rows[0] as any;
      let integrationResult;
      let status = "success";
      let errorMessage = null;

      try {
        // Execute based on source type
        if (source.type === "perplexity") {
          integrationResult = await perplexityIntegration.execute(source.config);
        } else if (source.type === "airtable") {
          integrationResult = await airtableIntegration.execute(source.config);
        } else {
          throw new Error(`Unknown source type: ${source.type}`);
        }
      } catch (error) {
        integrationResult = { error: (error as Error).message };
        status = "error";
        errorMessage = (error as Error).message;
      }

      // Store result in source_results table
      const resultInsert = await db.query(
        `INSERT INTO source_results (source_id, data, status, error_message) 
         VALUES ($1, $2, $3, $4) 
         RETURNING *`,
        [id, JSON.stringify(integrationResult), status, errorMessage]
      );

      // Update source with last execution info
      await db.query(
        `UPDATE sources 
         SET last_executed_at = CURRENT_TIMESTAMP,
             last_execution_status = $1
         WHERE id = $2`,
        [status, id]
      );

      return new Response(JSON.stringify(resultInsert.rows[0]), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: (error as Error).message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  // GET /api/sources/:id/results - Get source results
  if (req.method === "GET" && pathParts.length === 4 && pathParts[3] === "results") {
    try {
      const id = pathParts[2];
      const limit = url.searchParams.get("limit") || "50";
      
      const result = await db.query(
        `SELECT * FROM source_results 
         WHERE source_id = $1 
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

  // GET /api/integrations/airtable/bases - List Airtable bases
  if (req.method === "GET" && pathname === "/api/integrations/airtable/bases") {
    try {
      const bases = await airtableIntegration.listBases();
      return new Response(JSON.stringify(bases), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: (error as Error).message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  // GET /api/integrations/airtable/bases/:baseId/tables - List tables in a base
  if (req.method === "GET" && pathParts[1] === "integrations" && 
      pathParts[2] === "airtable" && pathParts[3] === "bases" && 
      pathParts[5] === "tables" && pathParts.length === 6) {
    try {
      const baseId = pathParts[4];
      const tables = await airtableIntegration.listTables(baseId);
      return new Response(JSON.stringify(tables), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: (error as Error).message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  // GET /api/integrations/airtable/bases/:baseId/tables/:tableId/schema - Get table schema
  if (req.method === "GET" && pathParts[1] === "integrations" && 
      pathParts[2] === "airtable" && pathParts[3] === "bases" && 
      pathParts[5] === "tables" && pathParts[7] === "schema" && pathParts.length === 8) {
    try {
      const baseId = pathParts[4];
      const tableId = pathParts[6];
      const schema = await airtableIntegration.getTableSchema(baseId, tableId);
      return new Response(JSON.stringify(schema), {
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
