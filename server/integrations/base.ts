// Base Integration class for all external service integrations
export abstract class Integration {
  abstract name: string;
  abstract requiredEnvVars: string[];

  // Validate that integration is properly configured
  abstract validate(): Promise<boolean>;

  // Execute the integration with provided configuration
  abstract execute(config: any): Promise<any>;

  // Get the configuration schema for this integration
  abstract getConfigSchema(): object;

  // Helper method to check if required environment variables are set
  protected checkEnvVars(): { valid: boolean; missing: string[] } {
    const missing: string[] = [];
    for (const envVar of this.requiredEnvVars) {
      if (!Deno.env.get(envVar)) {
        missing.push(envVar);
      }
    }
    return { valid: missing.length === 0, missing };
  }
}
