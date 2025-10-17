import { db } from "../db/client.ts";
import { perplexityIntegration } from "../integrations/perplexity.ts";
import { openrouterIntegration } from "../integrations/openrouter.ts";
import { gmailIntegration } from "../integrations/gmail.ts";
import { parseScheduleAndGetNextRun, formatDateForLog, formatDuration, processInfoPackageWithAI } from "./utils.ts";

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

                // Store both DB result AND source metadata
                sourceResults.push({
                  dbResult: resultInsert.rows[0],
                  sourceName: sourceData.name,
                  sourceId: sourceData.id,
                  sourceType: sourceData.type
                });
                
                const sourceEndTime = new Date();
                const sourceDuration = formatDuration(sourceStartTime, sourceEndTime);
                console.log(`[QUERY-BATCH]     ✓ Source "${sourceData.name}" completed in ${sourceDuration}`);
                
              } catch (error) {
                const errorMessage = (error as Error).message;
                console.error(`[QUERY-BATCH]     ✗ Source "${sourceData.name}" failed: ${errorMessage}`);
                
                // Store error result
                const errorInsert = await db.query(
                  `INSERT INTO source_results (source_id, data, status, error_message) 
                   VALUES ($1, $2, $3, $4)
                   RETURNING *`,
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
                
                // Add error result to collection with metadata
                sourceResults.push({
                  dbResult: errorInsert.rows[0],
                  sourceName: sourceData.name,
                  sourceId: sourceData.id,
                  sourceType: sourceData.type
                });
              }
            }
            
            // Transform source results to match manual execution format
            data.sources = sourceResults.map((result: any) => {
              const dbResult = result.dbResult;
              
              // Extract the actual content from the nested data field
              const actualData = typeof dbResult.data === 'string' ? JSON.parse(dbResult.data) : dbResult.data;
              
              // Match the structure from manual execution (/api/queries/:id/execute)
              return {
                sourceId: result.sourceId,
                sourceName: result.sourceName,
                sourceType: result.sourceType,
                result: dbResult, // Include full database result
                status: dbResult.status,
                executedAt: dbResult.executed_at
              };
            });
            
            const successCount = sourceResults.filter(r => r.dbResult.status === "success").length;
            const errorCount = sourceResults.filter(r => r.dbResult.status === "error").length;
            
            // Add execution summary (matching manual execution format)
            data.executionSummary = {
              totalSources: sourceResults.length,
              successCount: successCount,
              errorCount: errorCount
            };
            
            console.log(`[QUERY-BATCH]   → Completed ${successCount}/${sourceResults.length} source(s) successfully (${errorCount} failed)`);
          } else {
            console.log(`[QUERY-BATCH]   → No sources configured for this query`);
            data.sources = [];
            data.executionSummary = {
              totalSources: 0,
              successCount: 0,
              errorCount: 0
            };
          }

          // Create info package with improved data structure
          const infoPackageResult = await db.query(
            "INSERT INTO info_packages (query_id, data, directive, processed) VALUES ($1, $2, $3, false) RETURNING *",
            [queryData.id, JSON.stringify(data), queryData.directive]
          );
          
          const infoPackage = infoPackageResult.rows[0] as any;
          
          // Copy tags from query to info package
          const tagsResult = await db.query(
            `SELECT tag_id FROM query_tags WHERE query_id = $1`,
            [queryData.id]
          );

          if (tagsResult.rows.length > 0) {
            const tagIds = tagsResult.rows.map((row: any) => row.tag_id);
            const values = tagIds.map((_tagId: any, i: number) => `($1, $${i + 2})`).join(", ");
            const params = [infoPackage.id, ...tagIds];
            await db.query(
              `INSERT INTO info_package_tags (info_package_id, tag_id) VALUES ${values}`,
              params
            );
          }
          
          // Check if auto-process with AI is enabled
          console.log(`[QUERY-BATCH]   → Checking auto_process_with_ai flag: ${queryData.auto_process_with_ai}`);
          if (queryData.auto_process_with_ai) {
            console.log(`[QUERY-BATCH]   → Auto-processing with AI is ENABLED, triggering AI processing for info package ${infoPackage.id}`);
            try {
              const aiStartTime = new Date();
              const content = await processInfoPackageWithAI(db, infoPackage.id, openrouterIntegration);
              const aiEndTime = new Date();
              const aiDuration = formatDuration(aiStartTime, aiEndTime);
              console.log(`[QUERY-BATCH]   → ✓ AI content generated in ${aiDuration} (Content ID: ${content.id})`);
            } catch (error) {
              console.error(`[QUERY-BATCH]   → ✗ AI processing failed: ${(error as Error).message}`);
              console.error(`[QUERY-BATCH]   → Error details:`, error);
            }
          } else {
            console.log(`[QUERY-BATCH]   → Auto-processing with AI is DISABLED, skipping AI processing`);
          }

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

  // Execute scheduled outputs every 1 minute (checking next_run_at like queries)
  setInterval(async () => {
    const checkTime = new Date();
    console.log(`[OUTPUT-SCHEDULER] Checking for scheduled outputs... (${formatDateForLog(checkTime)})`);
    
    try {
      // Select only outputs that are due to run (next_run_at <= NOW)
      const outputs = await db.query(
        `SELECT * FROM outputs 
         WHERE active = true 
         AND schedule IS NOT NULL 
         AND (next_run_at IS NULL OR next_run_at <= NOW())
         ORDER BY next_run_at ASC NULLS FIRST`
      );

      if (outputs.rows.length === 0) {
        console.log("[OUTPUT-SCHEDULER] No outputs due for execution");
        return;
      }

      console.log(`[OUTPUT-SCHEDULER] Found ${outputs.rows.length} output${outputs.rows.length !== 1 ? 's' : ''} due for execution`);

      for (const output of outputs.rows) {
        const outputData = output as any;
        const startTime = new Date();
        console.log(`[OUTPUT-SCHEDULER] Executing: "${outputData.name}" (ID: ${outputData.id})`);
        
        try {
          const outputConfig = outputData.config;
          
          // This is now handled by the /api/outputs/:id/execute endpoint logic
          // We'll call that same logic here
          
          // Get tag IDs for this output
          const tagResult = await db.query(
            "SELECT tag_id FROM output_tags WHERE output_id = $1",
            [outputData.id]
          );
          const tagIds = tagResult.rows.map((row: any) => row.tag_id);

          // Calculate cutoff date based on config
          let cutoffDate: Date;
          const cutoffDays = outputConfig.cutoff_days;
          
          if (cutoffDays === -1) {
            // All time
            cutoffDate = new Date(0);
          } else if (cutoffDays) {
            cutoffDate = new Date(Date.now() - cutoffDays * 24 * 60 * 60 * 1000);
          } else {
            // Default to last 7 days
            cutoffDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
          }

          // Query content based on tags and date cutoff
          let contentQuery;
          if (tagIds.length > 0) {
            // Build placeholders for tag IDs
            const tagPlaceholders = tagIds.map((_: any, i: number) => `$${i + 2}`).join(',');
            
            contentQuery = await db.query(
              `SELECT DISTINCT c.* FROM content c
               JOIN content_tags ct ON c.id = ct.content_id
               WHERE ct.tag_id IN (${tagPlaceholders})
               AND c.created_at >= $1
               ORDER BY c.created_at DESC`,
              [cutoffDate.toISOString(), ...tagIds]
            );
          } else {
            contentQuery = await db.query(
              `SELECT * FROM content 
               WHERE created_at >= $1
               ORDER BY c.created_at DESC`,
              [cutoffDate.toISOString()]
            );
          }

          const contentItems = contentQuery.rows;
          const contentIds: number[] = [];
          const results: any[] = [];

          if (outputData.type === "gmail") {
            try {
              // Handle both old (recipient) and new (recipients) formats
              const recipients = outputConfig.recipients || [outputConfig.recipient || "default@example.com"];
              const toField = recipients.join(', ');
              
              // Prepare content items with dates and citations for HTML template
              const contentItemsForEmail: Array<{content: string, date: string, citations: string[]}> = [];
              
              for (const content of contentItems) {
                const contentData = content as any;
                const contentText = contentData.edited_content || contentData.content;
                const dateStr = new Date(contentData.created_at).toLocaleString();
                const citations = contentData.citations || [];
                
                contentItemsForEmail.push({
                  content: contentText,
                  date: dateStr,
                  citations: citations
                });
                
                contentIds.push(contentData.id);
              }
              
              // Use styled HTML email with output title
              const gmailResult = await gmailIntegration.sendStyledEmail({
                to: toField,
                subject: outputConfig.subject || "Content from Palimpsest",
                contentItems: contentItemsForEmail,
                labels: outputConfig.labels || [],
                outputTitle: outputData.name,
              });

              results.push({ success: true, result: gmailResult });
            } catch (error) {
              results.push({ success: false, error: (error as Error).message });
            }
          }

          // Format contentIds as PostgreSQL array literal
          const pgArrayFormat = contentIds.length > 0 ? `{${contentIds.join(',')}}` : '{}';
          
          // Combine all content for logging
          const combinedContent = contentItems.map((c: any) => 
            c.edited_content || c.content
          ).join("\n\n---\n\n");
          
          await db.query(
            `INSERT INTO output_logs (output_id, content_ids, status, details, output_content) 
             VALUES ($1, $2, $3, $4, $5)`,
            [outputData.id, pgArrayFormat, "success", JSON.stringify(results), combinedContent]
          );

          // Calculate next run time based on schedule
          const scheduleInfo = parseScheduleAndGetNextRun(outputData.schedule);
          
          // Update next_run_at for this output
          await db.query(
            "UPDATE outputs SET next_run_at = $1 WHERE id = $2",
            [scheduleInfo.nextRunAt, outputData.id]
          );

          const endTime = new Date();
          const duration = formatDuration(startTime, endTime);
          
          console.log(`[OUTPUT-SCHEDULER] ✓ Completed: "${outputData.name}" in ${duration}`);
          console.log(`[OUTPUT-SCHEDULER]   → Schedule: ${scheduleInfo.description}`);
          console.log(`[OUTPUT-SCHEDULER]   → Next run: ${formatDateForLog(scheduleInfo.nextRunAt)}`);
          console.log(`[OUTPUT-SCHEDULER]   → Content items: ${contentIds.length}`);
          
        } catch (error) {
          const endTime = new Date();
          const duration = formatDuration(startTime, endTime);
          console.error(`[OUTPUT-SCHEDULER] ✗ Failed: "${outputData.name}" after ${duration}`);
          console.error(`[OUTPUT-SCHEDULER]   → Error: ${(error as Error).message}`);
          
          // Still update next_run_at even on failure
          try {
            const scheduleInfo = parseScheduleAndGetNextRun(outputData.schedule);
            await db.query(
              "UPDATE outputs SET next_run_at = $1 WHERE id = $2",
              [scheduleInfo.nextRunAt, outputData.id]
            );
            console.log(`[OUTPUT-SCHEDULER]   → Rescheduled for: ${formatDateForLog(scheduleInfo.nextRunAt)}`);
          } catch (rescheduleError) {
            console.error(`[OUTPUT-SCHEDULER]   → Failed to reschedule: ${(rescheduleError as Error).message}`);
          }
        }
      }
    } catch (error) {
      console.error("[OUTPUT-SCHEDULER] Error in output scheduler:", error);
    }
  }, 1 * 60 * 1000); // Check every 1 minute

  console.log("Local scheduler started successfully!");
}
