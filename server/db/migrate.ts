import { db } from "./client.ts";
import { dirname, join, fromFileUrl } from "https://deno.land/std@0.208.0/path/mod.ts";

async function runMigrations() {
  console.log("🔄 Running database migrations...");

  try {
    // Create migrations tracking table if it doesn't exist
    await db.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        migration_name VARCHAR(255) UNIQUE NOT NULL,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Get list of already applied migrations
    const appliedResult = await db.query(
      "SELECT migration_name FROM schema_migrations ORDER BY migration_name"
    );
    const appliedMigrations = new Set(
      appliedResult.rows.map((row: any) => row.migration_name)
    );

    // Get migration files from the migrations directory
    // Use fromFileUrl to properly handle Windows paths
    const currentDir = dirname(fromFileUrl(import.meta.url));
    const migrationsDir = join(currentDir, "migrations");

    const migrations: string[] = [];
    for await (const entry of Deno.readDir(migrationsDir)) {
      if (entry.isFile && entry.name.endsWith(".sql")) {
        migrations.push(entry.name);
      }
    }

    // Sort migrations by name (assumes numeric prefix)
    migrations.sort();

    // Apply pending migrations
    let appliedCount = 0;
    for (const migrationFile of migrations) {
      if (!appliedMigrations.has(migrationFile)) {
        console.log(`  Applying migration: ${migrationFile}`);

        const migrationPath = join(migrationsDir, migrationFile);
        const sql = await Deno.readTextFile(migrationPath);

        // Split SQL into individual statements (by semicolon)
        // Remove comments and empty lines
        const lines = sql.split('\n');
        const statements: string[] = [];
        let currentStatement = '';
        
        for (const line of lines) {
          const trimmedLine = line.trim();
          // Skip empty lines and comment-only lines
          if (!trimmedLine || trimmedLine.startsWith('--')) {
            continue;
          }
          
          currentStatement += ' ' + trimmedLine;
          
          // If line ends with semicolon, it's the end of a statement
          if (trimmedLine.endsWith(';')) {
            statements.push(currentStatement.trim().slice(0, -1)); // Remove trailing semicolon
            currentStatement = '';
          }
        }
        
        // Add last statement if exists
        if (currentStatement.trim()) {
          statements.push(currentStatement.trim());
        }

        // Execute each statement separately and wait for completion
        for (let i = 0; i < statements.length; i++) {
          const statement = statements[i].trim();
          if (statement) {
            console.log(`    Executing statement ${i + 1}/${statements.length}...`);
            try {
              await db.query(statement);
            } catch (error) {
              console.error(`    Failed on statement ${i + 1}: ${statement.substring(0, 100)}...`);
              throw error;
            }
          }
        }

        // Record that migration was applied
        await db.query(
          "INSERT INTO schema_migrations (migration_name) VALUES ($1)",
          [migrationFile]
        );

        appliedCount++;
        console.log(`  ✅ Applied: ${migrationFile}`);
      }
    }

    if (appliedCount === 0) {
      console.log("✅ No new migrations to apply");
    } else {
      console.log(`✅ Successfully applied ${appliedCount} migration(s)`);
    }
  } catch (error) {
    console.error("❌ Migration failed:", error);
    throw error;
  }
}

// Run migrations if this file is executed directly
if (import.meta.main) {
  await runMigrations();
  await db.close();
  Deno.exit(0);
}

export { runMigrations };
