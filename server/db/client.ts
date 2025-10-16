import { neon } from "@neon/serverless";
import { config } from "../config.ts";

class DatabaseClient {
  private sql: any;

  constructor() {
    this.sql = neon(config.database.url);
  }

  async query(text: string, params?: any[]) {
    // Neon serverless driver uses SQL tagged templates
    // For parameterized queries, we need to build the query string
    if (params && params.length > 0) {
      // Replace $1, $2, etc. with actual parameter values
      let processedText = text;
      params.forEach((param, index) => {
        const placeholder = `$${index + 1}`;
        const value = typeof param === 'string' ? `'${param.replace(/'/g, "''")}'` : 
                     param === null ? 'NULL' :
                     typeof param === 'object' ? `'${JSON.stringify(param).replace(/'/g, "''")}'` :
                     param;
        processedText = processedText.replace(placeholder, value);
      });
      const result = await this.sql(processedText);
      return { rows: result };
    } else {
      const result = await this.sql(text);
      return { rows: result };
    }
  }

  async transaction(callback: (client: any) => Promise<void>) {
    // Neon serverless driver handles transactions differently
    // For simplicity, we'll execute the callback directly
    // In production, you might want to use Neon's transaction support
    await this.sql('BEGIN');
    try {
      await callback(this);
      await this.sql('COMMIT');
    } catch (error) {
      await this.sql('ROLLBACK');
      throw error;
    }
  }

  async close() {
    // Neon serverless driver doesn't require explicit connection closing
    // Connections are managed automatically
  }
}

export const db = new DatabaseClient();
