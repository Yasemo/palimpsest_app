import { db } from "../db/client.ts";
import { perplexityIntegration } from "../integrations/perplexity.ts";
import { openrouterIntegration } from "../integrations/openrouter.ts";
import { gmailIntegration } from "../integrations/gmail.ts";
import { parseScheduleAndGetNextRun, formatDateForLog, formatDuration } from "./utils.ts";

// Local scheduler using setInterval for development environment
// Note: For production, use Google Cloud Scheduler
export function startLocalScheduler() {
  console.log("Starting local scheduler...");

  // Check for scheduled sources every 5 minutes
  setInterval(async () => {
    console.log("Checking for scheduled sources...");
    try {
      const sources = await db.query(
        "SELECT * FROM sources WHERE active = true AND schedule IS NOT NULL"
      );

      for (const source of sources.rows) {
        const sourceData = source as any;
        console.log(`Executing source: ${sourceData.name}`);
        
        try {
          let result;
          if (sourceData.type === "perplexity") {
            result = await perplexityIntegration.execute(sourceData.config);
          }

          await db.query(
            "INSERT INTO source_results (source_id, data, status) VALUES ($1, $2, $3)",
            [sourceData.id, JSON.stringify(result), "success"]
          );
        } catch (error) {
          console.error(`Error executing source ${sourceData.name}:`, error);
          await db.query(
            "INSERT INTO source_results (source_id, data, status) VALUES ($1, $2, $3)",
            [sourceData.id, JSON.stringify({ error: (error as Error).message }), "error"]
          );
        }
      }
    } catch (error) {
      console.error("Error in source scheduler:", error);
    }
  }, 5 * 60 * 1000); // 5 minutes

  // Check for scheduled queries every 1 minute
  setInterval(async () => {
    const checkTime = new Date();
    console.log(`[SCHEDULER] Checking for scheduled queries... (${formatDateForLog(checkTime)})`);
    
    try {
      // Select only queries that are due to run (next_run_at <= NOW)
      const queries = await db.query(
        `SELECT * FROM queries 
         WHERE active = true 
         AND schedule IS NOT NULL 
         AND (next_run_at IS NULL OR next_run_at <= NOW())
         ORDER BY next_run_at ASC NULLS FIRST`
      );

      if (queries.rows.length === 0) {
        console.log("[QUERY-BATCH] No queries due for execution");
        return;
      }

      console.log(`[QUERY-BATCH] Found ${queries.rows.length} query batch${queries.rows.length !== 1 ? 'es' : ''} due for execution`);

      for (const query of queries.rows) {
        const queryData = query as any;
        const startTime = new Date();
        console.log(`[QUERY-BATCH] Executing: "${queryData.name}" (ID: ${queryData.id})`);
        
        try {
          const queryConfig = queryData.query_config;
          let data: any = {
            queryId: queryData.id,
            queryName: queryData.name,
            executedAt: startTime.toISOString()
          };

          // Execute sources fresh before processing query
          if (queryConfig.sources && Array.isArray(queryConfig.sources) && queryConfig.sources.length > 0) {
            console.log(`[QUERY-BATCH]   → Executing ${queryConfig.sources.length} source(s) fresh`);
            const sourceResults: any[] = [];
            
            // Get source details
            const placeholders = queryConfig.sources.map((_: any, i: number) => `$${i + 1}`).join(',');
            const sourcesQuery = await db.query(
              `SELECT * FROM sources WHERE id IN (${placeholders})`,
              queryConfig.sources
            );
            
            // Execute each source sequentially
            for (const source of sourcesQuery.rows) {
              const sourceData = source as any;
              const sourceStartTime = new Date();
              console.log(`[QUERY-BATCH]     • Executing source: "${sourceData.name}" (ID: ${sourceData.id})`);
              
              try {
                let result;
                if (sourceData.type === "perplexity") {
                  result = await perplexityIntegration.execute(sourceData.config);
                } else {
                  throw new Error(`Unknown source type: ${sourceData.type}`);
                }

                // Store result in source_results table
                const resultInsert = await db.query(
                  `INSERT INTO source_results (source_id, data, status) 
                   VALUES ($1, $2, $3) 
                   RETURNING *`,
                  [sourceData.id, JSON.stringify(result), "success"]
                );

                // Update source last execution
                await db.query(
                  `UPDATE sources 
                   SET last_executed_at = CURRENT_TIMESTAMP,
                       last_execution_status = $1
                   WHERE id = $2`,
                  ["success", sourceData.id]
                );

                sourceResults.push(resultInsert.rows[0]);
                
                const sourceEndTime = new Date();
                const sourceDuration = formatDuration(sourceStartTime, sourceEndTime);
                console.log(`[QUERY-BATCH]     ✓ Source "${sourceData.name}" completed in ${sourceDuration}`);
                
              } catch (error) {
                const errorMessage = (error as Error).message;
                console.error(`[QUERY-BATCH]     ✗ Source "${sourceData.name}" failed: ${errorMessage}`);
                
                // Store error result
                await db.query(
                  `INSERT INTO source_results (source_id, data, status, error_message) 
                   VALUES ($1, $2, $3, $4)`,
                  [sourceData.id, JSON.stringify({ error: errorMessage }), "error", errorMessage]
                );

                // Update source last execution
                await db.query(
                  `UPDATE sources 
                   SET last_executed_at = CURRENT_TIMESTAMP,
                       last_execution_status = $1
                   WHERE id = $2`,
                  ["error", sourceData.id]
                );
                
                // Add error result to collection (don't stop processing other sources)
                sourceResults.push({
                  source_id: sourceData.id,
                  data: { error: errorMessage },
                  status: "error",
                  error_message: errorMessage,
                  executed_at: new Date().toISOString()
                });
              }
            }
            
            data.sources = sourceResults;
            const successCount = sourceResults.filter(r => r.status === "success").length;
            const errorCount = sourceResults.filter(r => r.status === "error").length;
            console.log(`[QUERY-BATCH]   → Completed ${successCount}/${sourceResults.length} source(s) successfully (${errorCount} failed)`);
          } else {
            console.log(`[QUERY-BATCH]   → No sources configured for this query`);
            data.sources = [];
          }

          // Create info package
          await db.query(
            "INSERT INTO info_packages (query_id, data, directive, processed) VALUES ($1, $2, $3, false)",
            [queryData.id, JSON.stringify(data), queryData.directive]
          );

          // Calculate next run time based on schedule
          const scheduleInfo = parseScheduleAndGetNextRun(queryData.schedule);
          
          // Update next_run_at for this query
          await db.query(
            "UPDATE queries SET next_run_at = $1 WHERE id = $2",
            [scheduleInfo.nextRunAt, queryData.id]
          );

          const endTime = new Date();
          const duration = formatDuration(startTime, endTime);
          
          console.log(`[QUERY-BATCH] ✓ Completed: "${queryData.name}" in ${duration}`);
          console.log(`[QUERY-BATCH]   → Schedule: ${scheduleInfo.description}`);
          console.log(`[QUERY-BATCH]   → Next run: ${formatDateForLog(scheduleInfo.nextRunAt)}`);
          
        } catch (error) {
          const endTime = new Date();
          const duration = formatDuration(startTime, endTime);
          console.error(`[QUERY-BATCH] ✗ Failed: "${queryData.name}" after ${duration}`);
          console.error(`[QUERY-BATCH]   → Error: ${(error as Error).message}`);
          
          // Still update next_run_at even on failure, so we don't get stuck retrying immediately
          try {
            const scheduleInfo = parseScheduleAndGetNextRun(queryData.schedule);
            await db.query(
              "UPDATE queries SET next_run_at = $1 WHERE id = $2",
              [scheduleInfo.nextRunAt, queryData.id]
            );
            console.log(`[QUERY-BATCH]   → Rescheduled for: ${formatDateForLog(scheduleInfo.nextRunAt)}`);
          } catch (rescheduleError) {
            console.error(`[QUERY-BATCH]   → Failed to reschedule: ${(rescheduleError as Error).message}`);
          }
        }
      }
    } catch (error) {
      console.error("[QUERY-BATCH] Error in query scheduler:", error);
    }
  }, 1 * 60 * 1000); // Check every 1 minute

  // Process unprocessed info packages every 15 minutes
  setInterval(async () => {
    console.log("Checking for unprocessed info packages...");
    try {
      const packages = await db.query(
        "SELECT * FROM info_packages WHERE processed = false ORDER BY created_at ASC LIMIT 10"
      );

      const aiConfig = await db.query("SELECT * FROM ai_config WHERE id = 1");
      const config = aiConfig.rows[0] as any;

      for (const pkg of packages.rows) {
        const packageData = pkg as any;
        console.log(`Processing info package: ${packageData.id}`);
        
        try {
          const userPrompt = `${packageData.directive}\n\nHere is the data to work with:\n${JSON.stringify(packageData.data, null, 2)}`;

          const aiResponse = await openrouterIntegration.execute({
            model: config.model,
            systemPrompt: config.system_prompt,
            userPrompt,
            temperature: config.temperature,
          });

          await db.query(
            "INSERT INTO content (info_package_id, content, chat_history) VALUES ($1, $2, $3)",
            [packageData.id, aiResponse.content, JSON.stringify([])]
          );

          await db.query(
            "UPDATE info_packages SET processed = true WHERE id = $1",
            [packageData.id]
          );
        } catch (error) {
          console.error(`Error processing package ${packageData.id}:`, error);
        }
      }
    } catch (error) {
      console.error("Error in package processor:", error);
    }
  }, 15 * 60 * 1000); // 15 minutes

  // Execute scheduled outputs every 30 minutes
  setInterval(async () => {
    console.log("Checking for scheduled outputs...");
    try {
      const outputs = await db.query(
        "SELECT * FROM outputs WHERE active = true AND schedule IS NOT NULL"
      );

      for (const output of outputs.rows) {
        const outputData = output as any;
        console.log(`Executing output: ${outputData.name}`);
        
        try {
          const outputConfig = outputData.config;
          const fromDate = outputConfig.from_date || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
          const toDate = outputConfig.to_date || new Date().toISOString();

          const contentQuery = await db.query(
            "SELECT * FROM content WHERE created_at >= $1 AND created_at <= $2 ORDER BY created_at DESC",
            [fromDate, toDate]
          );

          const contentIds: number[] = [];
          const results: any[] = [];

          if (outputData.type === "gmail") {
            for (const content of contentQuery.rows) {
              const contentData = content as any;
              contentIds.push(contentData.id);

              try {
                const emailBody = contentData.edited_content || contentData.content;
                const gmailResult = await gmailIntegration.execute({
                  to: outputConfig.recipient || "default@example.com",
                  subject: outputConfig.subject || "Content from Palimpsest",
                  body: emailBody,
                  contentType: outputConfig.content_type || "text/plain",
                });

                results.push({ contentId: contentData.id, success: true, result: gmailResult });
              } catch (error) {
                results.push({ contentId: contentData.id, success: false, error: (error as Error).message });
              }
            }
          }

          await db.query(
            "INSERT INTO output_logs (output_id, content_ids, status, details) VALUES ($1, $2, $3, $4)",
            [outputData.id, contentIds, "success", JSON.stringify(results)]
          );
        } catch (error) {
          console.error(`Error executing output ${outputData.name}:`, error);
        }
      }
    } catch (error) {
      console.error("Error in output scheduler:", error);
    }
  }, 30 * 60 * 1000); // 30 minutes

  console.log("Local scheduler started successfully!");
}
