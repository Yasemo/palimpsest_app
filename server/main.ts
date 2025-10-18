import { serveDir } from "https://deno.land/std@0.208.0/http/file_server.ts";
import { config, validateConfig } from "./config.ts";
import { handleSourcesRoutes } from "./routes/sources.ts";
import { handleQueriesRoutes } from "./routes/queries.ts";
import { handleAIRoutes } from "./routes/ai.ts";
import { handleContentRoutes } from "./routes/content.ts";
import { handleOutputsRoutes } from "./routes/outputs.ts";
import { handleTagsRoutes } from "./routes/tags.ts";
import { handleAuthRoutes } from "./routes/auth.ts";
import { requireAuth, requireWebhookAuth } from "./middleware/auth.ts";
import { startLocalScheduler } from "./schedulers/local.ts";
import { 
  handleQueriesExecution, 
  handleOutputsExecution 
} from "./schedulers/cloud.ts";
import { perplexityIntegration } from "./integrations/perplexity.ts";
import { airtableIntegration } from "./integrations/airtable.ts";
import { openrouterIntegration } from "./integrations/openrouter.ts";
import { gmailIntegration } from "./integrations/gmail.ts";
import { runMigrations } from "./db/migrate.ts";

// Validate configuration on startup
const configValidation = validateConfig();
if (!configValidation.valid) {
  console.error("Missing required environment variables:", configValidation.missing);
  console.error("Please check your .env file");
  Deno.exit(1);
}

console.log("Configuration validated successfully!");
console.log(`Environment: ${config.server.environment}`);
console.log(`Port: ${config.server.port}`);

// Run database migrations on startup
try {
  await runMigrations();
} catch (error) {
  console.error("Failed to run database migrations:", error);
  console.error("Server startup aborted.");
  Deno.exit(1);
}

// CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// Main request handler
async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const pathname = url.pathname;
  const method = req.method;
  const timestamp = new Date().toISOString();

  // Log incoming request
  console.log(`[${timestamp}] ${method} ${pathname}`);

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    console.log(`[${timestamp}] ${method} ${pathname} - 200 (CORS preflight)`);
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth routes (public - no authentication required)
    if (pathname.startsWith("/api/auth")) {
      const response = await handleAuthRoutes(req, pathname);
      Object.entries(corsHeaders).forEach(([key, value]) => {
        response.headers.set(key, value);
      });
      return response;
    }

    // Webhook endpoints for Google Cloud Scheduler (bearer token auth)
    if (pathname === "/webhooks/execute-queries" && req.method === "POST") {
      const authError = requireWebhookAuth(req);
      if (authError) return authError;
      
      const result = await handleQueriesExecution();
      const response = new Response(JSON.stringify(result), {
        status: result.success ? 200 : 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
      return response;
    }

    if (pathname === "/webhooks/execute-outputs" && req.method === "POST") {
      const authError = requireWebhookAuth(req);
      if (authError) return authError;
      
      const result = await handleOutputsExecution();
      const response = new Response(JSON.stringify(result), {
        status: result.success ? 200 : 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
      return response;
    }

    // Protected API routes - require authentication
    // Integration status endpoint (must be checked BEFORE general /api/integrations routing)
    if (pathname === "/api/integrations/status" && req.method === "GET") {
      const authError = await requireAuth(req);
      if (authError) return authError;
      
      const status = {
        perplexity: await perplexityIntegration.validate(),
        airtable: await airtableIntegration.validate(),
        openrouter: await openrouterIntegration.validate(),
        gmail: await gmailIntegration.validate(),
      };
      const response = new Response(JSON.stringify(status), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
      return response;
    }

    // API routes with authentication
    if (pathname.startsWith("/api/sources") || pathname.startsWith("/api/integrations")) {
      const authError = await requireAuth(req);
      if (authError) return authError;
      
      const response = await handleSourcesRoutes(req, pathname);
      Object.entries(corsHeaders).forEach(([key, value]) => {
        response.headers.set(key, value);
      });
      return response;
    }

    if (pathname.startsWith("/api/queries") || pathname.startsWith("/api/info-packages")) {
      const authError = await requireAuth(req);
      if (authError) return authError;
      
      const response = await handleQueriesRoutes(req, pathname);
      Object.entries(corsHeaders).forEach(([key, value]) => {
        response.headers.set(key, value);
      });
      return response;
    }

    if (pathname.startsWith("/api/ai")) {
      const authError = await requireAuth(req);
      if (authError) return authError;
      
      const response = await handleAIRoutes(req, pathname);
      Object.entries(corsHeaders).forEach(([key, value]) => {
        response.headers.set(key, value);
      });
      return response;
    }

    if (pathname.startsWith("/api/content")) {
      const authError = await requireAuth(req);
      if (authError) return authError;
      
      const response = await handleContentRoutes(req, pathname);
      Object.entries(corsHeaders).forEach(([key, value]) => {
        response.headers.set(key, value);
      });
      return response;
    }

    if (pathname.startsWith("/api/outputs")) {
      const authError = await requireAuth(req);
      if (authError) return authError;
      
      const response = await handleOutputsRoutes(req, pathname);
      Object.entries(corsHeaders).forEach(([key, value]) => {
        response.headers.set(key, value);
      });
      return response;
    }

    if (pathname.startsWith("/api/tags")) {
      const authError = await requireAuth(req);
      if (authError) return authError;
      
      const response = await handleTagsRoutes(req, pathname);
      Object.entries(corsHeaders).forEach(([key, value]) => {
        response.headers.set(key, value);
      });
      return response;
    }

    // Health check endpoint
    if (pathname === "/health" && req.method === "GET") {
      return new Response(JSON.stringify({ status: "ok", timestamp: new Date().toISOString() }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Serve static files from public directory
    const response = await serveDir(req, {
      fsRoot: "public",
      urlRoot: "",
      showDirListing: false,
      enableCors: true,
    });

    // Log successful response
    console.log(`[${timestamp}] ${method} ${pathname} - ${response.status}`);
    return response;
  } catch (error) {
    console.error(`[${timestamp}] ${method} ${pathname} - ERROR:`, error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
}

// Start server
console.log(`Starting Palimpsest server on port ${config.server.port}...`);

// Start local scheduler if in local environment
if (config.server.environment === "local") {
  startLocalScheduler();
}

Deno.serve({ port: config.server.port }, handler);

console.log(`✅ Palimpsest server running at http://localhost:${config.server.port}/`);
