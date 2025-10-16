import { neon } from "@neon/serverless";
import "https://deno.land/std@0.208.0/dotenv/load.ts";

const DATABASE_URL = Deno.env.get("DATABASE_URL");

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
    console.log("\n📊 Tables created:");
    console.log("  - sources");
    console.log("  - source_results");
    console.log("  - queries");
    console.log("  - info_packages");
    console.log("  - ai_config (with default settings)");
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
