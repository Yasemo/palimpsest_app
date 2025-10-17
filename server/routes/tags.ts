import { db } from "../db/client.ts";

export async function handleTagsRoutes(req: Request, pathname: string): Promise<Response> {
  const pathParts = pathname.split("/").filter(Boolean);

  // GET /api/tags - Get all tags
  if (req.method === "GET" && pathParts.length === 2 && pathParts[1] === "tags") {
    try {
      const result = await db.query(
        "SELECT * FROM tags ORDER BY name ASC"
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

  // POST /api/tags - Create new tag
  if (req.method === "POST" && pathParts.length === 2 && pathParts[1] === "tags") {
    try {
      const body = await req.json();
      const { name, color } = body;

      if (!name || !color) {
        return new Response(
          JSON.stringify({ error: "Missing required fields: name, color" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      // Check if tag already exists
      const existingTag = await db.query(
        "SELECT * FROM tags WHERE LOWER(name) = LOWER($1)",
        [name]
      );

      if (existingTag.rows.length > 0) {
        return new Response(JSON.stringify(existingTag.rows[0]), {
          headers: { "Content-Type": "application/json" },
        });
      }

      // Create new tag
      const result = await db.query(
        "INSERT INTO tags (name, color) VALUES ($1, $2) RETURNING *",
        [name, color]
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

  // POST /api/queries/:id/tags - Set tags for a query (replaces existing)
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
        const values = tag_ids.map((tagId, i) => `($1, $${i + 2})`).join(", ");
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
        const values = tag_ids.map((tagId, i) => `($1, $${i + 2})`).join(", ");
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
        const values = tag_ids.map((tagId, i) => `($1, $${i + 2})`).join(", ");
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

  return new Response(JSON.stringify({ error: "Not found" }), {
    status: 404,
    headers: { "Content-Type": "application/json" },
  });
}
