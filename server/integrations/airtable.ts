import { Integration } from "./base.ts";
import { config } from "../config.ts";

interface AirtableField {
  id: string;
  name: string;
  type: string;
}

interface AirtableTable {
  id: string;
  name: string;
  primaryFieldId?: string;
  fields?: AirtableField[];
}

interface AirtableBase {
  id: string;
  name: string;
  permissionLevel: string;
}

interface AirtableRecord {
  id: string;
  createdTime: string;
  fields: Record<string, any>;
}

export class AirtableIntegration extends Integration {
  name = "airtable";
  requiredEnvVars = ["AIRTABLE_API_KEY"];
  private baseUrl = "https://api.airtable.com/v0";

  async validate(): Promise<boolean> {
    console.log("[Airtable] Validating integration...");
    const envCheck = this.checkEnvVars();
    if (!envCheck.valid) {
      console.log("[Airtable] ❌ Environment variables not set");
      return false;
    }

    // Test the API key by fetching bases
    try {
      console.log("[Airtable] Testing API connection...");
      const response = await fetch(`${this.baseUrl}/meta/bases`, {
        headers: {
          "Authorization": `Bearer ${config.airtable.apiKey}`,
        },
      });

      if (response.ok) {
        console.log("[Airtable] ✅ Connected successfully");
      } else {
        console.log(`[Airtable] ❌ API error: ${response.status}`);
      }
      return response.ok;
    } catch (error) {
      console.error("[Airtable] ❌ Validation error:", error);
      return false;
    }
  }

  async listBases(): Promise<AirtableBase[]> {
    try {
      const response = await fetch(`${this.baseUrl}/meta/bases`, {
        headers: {
          "Authorization": `Bearer ${config.airtable.apiKey}`,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to fetch bases: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      return data.bases || [];
    } catch (error) {
      console.error("[Airtable] Error fetching bases:", error);
      throw error;
    }
  }

  async listTables(baseId: string): Promise<AirtableTable[]> {
    try {
      const response = await fetch(`${this.baseUrl}/meta/bases/${baseId}/tables`, {
        headers: {
          "Authorization": `Bearer ${config.airtable.apiKey}`,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to fetch tables: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      return data.tables || [];
    } catch (error) {
      console.error("[Airtable] Error fetching tables:", error);
      throw error;
    }
  }

  async getTableSchema(baseId: string, tableIdOrName: string): Promise<AirtableTable> {
    try {
      const response = await fetch(`${this.baseUrl}/meta/bases/${baseId}/tables`, {
        headers: {
          "Authorization": `Bearer ${config.airtable.apiKey}`,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to fetch table schema: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      const tables = data.tables || [];
      
      // Find table by ID or name
      const table = tables.find((t: AirtableTable) => 
        t.id === tableIdOrName || t.name === tableIdOrName
      );

      if (!table) {
        throw new Error(`Table not found: ${tableIdOrName}`);
      }

      return table;
    } catch (error) {
      console.error("[Airtable] Error fetching table schema:", error);
      throw error;
    }
  }

  async execute(sourceConfig: any): Promise<any> {
    const { 
      baseId,
      tableIdOrName,
      query = {}
    } = sourceConfig;

    if (!baseId || !tableIdOrName) {
      throw new Error("Airtable integration requires 'baseId' and 'tableIdOrName' in config");
    }

    const {
      fields = [],
      filterByFormula = "",
      maxRecords = 100,
      sort = [],
      view = ""
    } = query;

    // Build query parameters
    const params = new URLSearchParams();
    
    // Add fields if specified
    if (fields && fields.length > 0) {
      fields.forEach((field: string) => {
        params.append("fields[]", field);
      });
    }

    // Add filter formula if specified
    if (filterByFormula) {
      params.append("filterByFormula", filterByFormula);
    }

    // Add max records (cap at 100)
    const limitedMaxRecords = Math.min(maxRecords, 100);
    params.append("maxRecords", limitedMaxRecords.toString());

    // Add sort if specified
    if (sort && sort.length > 0) {
      sort.forEach((s: any, index: number) => {
        params.append(`sort[${index}][field]`, s.field);
        params.append(`sort[${index}][direction]`, s.direction || "asc");
      });
    }

    // Add view if specified
    if (view) {
      params.append("view", view);
    }

    try {
      // Fetch records from Airtable
      const response = await fetch(
        `${this.baseUrl}/${baseId}/${encodeURIComponent(tableIdOrName)}?${params.toString()}`,
        {
          headers: {
            "Authorization": `Bearer ${config.airtable.apiKey}`,
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Airtable API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      const records: AirtableRecord[] = data.records || [];

      // Get table schema to understand field types
      const tableSchema = await this.getTableSchema(baseId, tableIdOrName);
      
      // Determine which fields to display
      let displayFields: string[];
      if (fields && fields.length > 0) {
        displayFields = fields;
      } else {
        // Use all fields from schema
        displayFields = tableSchema.fields?.map(f => f.name) || [];
      }

      // Format as markdown table
      const markdownTable = this.formatAsMarkdownTable(records, displayFields);

      return {
        content: markdownTable,
        records: records.length,
        tableId: tableSchema.id,
        tableName: tableSchema.name,
        maxRecords: limitedMaxRecords,
        displayFields
      };
    } catch (error) {
      console.error("[Airtable] Execute error:", error);
      throw error;
    }
  }

  private formatAsMarkdownTable(records: AirtableRecord[], fields: string[]): string {
    if (records.length === 0) {
      return "No records found.";
    }

    // Create header row
    const headerRow = `| ${fields.join(" | ")} |`;
    const separatorRow = `| ${fields.map(() => "---").join(" | ")} |`;

    // Create data rows
    const dataRows = records.map(record => {
      const values = fields.map(field => {
        const value = record.fields[field];
        return this.formatCellValue(value);
      });
      return `| ${values.join(" | ")} |`;
    });

    // Combine all rows
    const table = [
      headerRow,
      separatorRow,
      ...dataRows
    ].join("\n");

    return `${table}\n\n**Total Records:** ${records.length}`;
  }

  private formatCellValue(value: any): string {
    if (value === null || value === undefined) {
      return "";
    }

    // Handle arrays (like multi-select, attachments, linked records)
    if (Array.isArray(value)) {
      if (value.length === 0) return "";
      
      // For attachments, show filename
      if (value[0]?.filename) {
        return value.map(v => v.filename).join(", ");
      }
      
      // For linked records, show names
      if (typeof value[0] === 'string') {
        return value.join(", ");
      }
      
      // For objects with name property
      if (value[0]?.name) {
        return value.map(v => v.name).join(", ");
      }
      
      return value.join(", ");
    }

    // Handle objects (like user fields)
    if (typeof value === 'object') {
      if (value.name) return value.name;
      if (value.email) return value.email;
      return JSON.stringify(value);
    }

    // Handle booleans
    if (typeof value === 'boolean') {
      return value ? "✓" : "✗";
    }

    // Handle numbers
    if (typeof value === 'number') {
      return value.toString();
    }

    // Handle strings - escape pipe characters
    const stringValue = String(value);
    return stringValue.replace(/\|/g, "\\|");
  }

  getConfigSchema(): object {
    return {
      type: "object",
      properties: {
        baseId: {
          type: "string",
          description: "Airtable base ID (e.g., appXXXXXXXXXXXXXX)",
          required: true,
        },
        tableIdOrName: {
          type: "string",
          description: "Table ID or name",
          required: true,
        },
        query: {
          type: "object",
          description: "Query configuration",
          properties: {
            fields: {
              type: "array",
              description: "Fields to retrieve (empty = all fields)",
              items: { type: "string" },
            },
            filterByFormula: {
              type: "string",
              description: "Airtable formula for filtering records",
            },
            maxRecords: {
              type: "number",
              description: "Maximum number of records to retrieve (max 100)",
              default: 100,
              maximum: 100,
            },
            sort: {
              type: "array",
              description: "Sort configuration",
              items: {
                type: "object",
                properties: {
                  field: { type: "string" },
                  direction: { type: "string", enum: ["asc", "desc"] },
                },
              },
            },
            view: {
              type: "string",
              description: "View name to use",
            },
          },
        },
      },
    };
  }
}

export const airtableIntegration = new AirtableIntegration();
