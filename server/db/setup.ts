import { neon } from "@neon/serverless";
import "https://deno.land/std@0.208.0/dotenv/load.ts";

const DATABASE_URL = Deno.env.get("DATABASE_URL");
const DEFAULT_AI_MODEL = Deno.env.get("DEFAULT_AI_MODEL") || "openai/gpt-4o";

if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL environment variable is not set");
  Deno.exit(1);
}

console.log("🔧 Setting up Palimpsest database...");

const sql = neon(DATABASE_URL);

try {
  // Read the schema file
  const schemaSQL = await Deno.readTextFile("server/db/schema.sql");
  
  console.log("📝 Executing database schema...");
  
  try {
    await sql(schemaSQL);
    console.log("✅ Database schema created successfully!");
    
    // Insert default AI config using environment variable
    console.log(`📝 Initializing AI config with model: ${DEFAULT_AI_MODEL}...`);
    await sql`
      INSERT INTO ai_config (id, model, system_prompt, temperature)
      VALUES (
        1, 
        ${DEFAULT_AI_MODEL}, 
        'You are a professional PR assistant helping the Canadian Muslim community create compelling media content.', 
        0.7
      )
      ON CONFLICT (id) DO NOTHING
    `;
    
    // Migration: Update existing configs that still have old hardcoded default
    console.log("📝 Migrating existing AI config to use DEFAULT_AI_MODEL...");
    const updateResult = await sql`
      UPDATE ai_config 
      SET model = ${DEFAULT_AI_MODEL}
      WHERE id = 1 AND model = 'openai/gpt-4'
    `;
    if (updateResult.count && updateResult.count > 0) {
      console.log(`✅ Updated existing AI config to use: ${DEFAULT_AI_MODEL}`);
    } else {
      console.log("✅ AI config initialized!");
    }
    
    console.log("\n📊 Tables created:");
    console.log("  - sources");
    console.log("  - source_results");
    console.log("  - queries");
    console.log("  - info_packages");
    console.log(`  - ai_config (with model: ${DEFAULT_AI_MODEL})`);
    console.log("  - content");
    console.log("  - outputs");
    console.log("  - output_logs");
    console.log("\n✨ Database setup complete!");
  } catch (error) {
    console.error("❌ Error setting up database:", error);
    Deno.exit(1);
  }
} catch (error) {
  console.error("❌ Error:", error);
  Deno.exit(1);
}
