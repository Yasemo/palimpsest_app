import { db } from "../db/client.ts";
import { perplexityIntegration } from "../integrations/perplexity.ts";
import { openrouterIntegration } from "../integrations/openrouter.ts";
import { gmailIntegration } from "../integrations/gmail.ts";
import { parseScheduleAndGetNextRun, formatDateForLog, formatDuration, processInfoPackageWithAI } from "./utils.ts";

/**
 * Cloud Scheduler handlers
 * These functions are called by Google Cloud Scheduler via webhooks
 * 
 * Note: Sources are executed within queries (not separately scheduled)
 * Note: Packages are auto-processed with AI within queries (not separately scheduled)
 */

/**
 * Execute all scheduled queries that are due
 */
export async function handleQueriesExecution(): Promise<{ success: boolean; message: string; details?: any }> {
  const checkTime = new Date();
  console.log(`[CLOUD-SCHEDULER] Executing scheduled queries... (${formatDateForLog(checkTime)})`);
  
  try {
    const queries = await db.query(
      `SELECT * FROM queries 
       WHERE active = true 
       AND schedule IS NOT NULL 
       AND (next_run_at IS NULL OR next_run_at <= NOW())
       ORDER BY next_run_at ASC NULLS FIRST`
    );

    if (queries.rows.length === 0) {
      console.log("[CLOUD-SCHEDULER] No queries due for execution");
      return { success: true, message: "No queries due for execution" };
    }

    console.log(`[CLOUD-SCHEDULER] Found ${queries.rows.length} quer${queries.rows.length !== 1 ? 'ies' : 'y'} due for execution`);

    const results = [];
    for (const query of queries.rows) {
      const queryData = query as any;
      const startTime = new Date();
      console.log(`[CLOUD-SCHEDULER] Executing: "${queryData.name}" (ID: ${queryData.id})`);
      
      try {
        const queryConfig = queryData.query_config;
        let data: any = {
          queryId: queryData.id,
          queryName: queryData.name,
          executedAt: startTime.toISOString()
        };

        // Execute sources fresh before processing query
        if (queryConfig.sources && Array.isArray(queryConfig.sources) && queryConfig.sources.length > 0) {
          console.log(`[CLOUD-SCHEDULER]   → Executing ${queryConfig.sources.length} source(s)`);
          const sourceResults: any[] = [];
          
          const placeholders = queryConfig.sources.map((_: any, i: number) => `$${i + 1}`).join(',');
          const sourcesQuery = await db.query(
            `SELECT * FROM sources WHERE id IN (${placeholders})`,
            queryConfig.sources
          );
          
          for (const source of sourcesQuery.rows) {
            const sourceData = source as any;
            console.log(`[CLOUD-SCHEDULER]     • Executing source: "${sourceData.name}"`);
            
            try {
              let result;
              if (sourceData.type === "perplexity") {
                result = await perplexityIntegration.execute(sourceData.config);
              } else {
                throw new Error(`Unknown source type: ${sourceData.type}`);
              }

              const resultInsert = await db.query(
                `INSERT INTO source_results (source_id, data, status) 
                 VALUES ($1, $2, $3) 
                 RETURNING *`,
                [sourceData.id, JSON.stringify(result), "success"]
              );

              await db.query(
                `UPDATE sources 
                 SET last_executed_at = CURRENT_TIMESTAMP,
                     last_execution_status = $1
                 WHERE id = $2`,
                ["success", sourceData.id]
              );

              sourceResults.push({
                dbResult: resultInsert.rows[0],
                sourceName: sourceData.name,
                sourceId: sourceData.id,
                sourceType: sourceData.type
              });
            } catch (error) {
              const errorMessage = (error as Error).message;
              console.error(`[CLOUD-SCHEDULER]     ✗ Source "${sourceData.name}" failed: ${errorMessage}`);
              
              const errorInsert = await db.query(
                `INSERT INTO source_results (source_id, data, status, error_message) 
                 VALUES ($1, $2, $3, $4)
                 RETURNING *`,
                [sourceData.id, JSON.stringify({ error: errorMessage }), "error", errorMessage]
              );

              await db.query(
                `UPDATE sources 
                 SET last_executed_at = CURRENT_TIMESTAMP,
                     last_execution_status = $1
                 WHERE id = $2`,
                ["error", sourceData.id]
              );
              
              sourceResults.push({
                dbResult: errorInsert.rows[0],
                sourceName: sourceData.name,
                sourceId: sourceData.id,
                sourceType: sourceData.type
              });
            }
          }
          
          data.sources = sourceResults.map((result: any) => {
            const dbResult = result.dbResult;
            const actualData = typeof dbResult.data === 'string' ? JSON.parse(dbResult.data) : dbResult.data;
            
            return {
              sourceId: result.sourceId,
              sourceName: result.sourceName,
              sourceType: result.sourceType,
              result: dbResult,
              status: dbResult.status,
              executedAt: dbResult.executed_at
            };
          });
          
          const successCount = sourceResults.filter(r => r.dbResult.status === "success").length;
          const errorCount = sourceResults.filter(r => r.dbResult.status === "error").length;
          
          data.executionSummary = {
            totalSources: sourceResults.length,
            successCount: successCount,
            errorCount: errorCount
          };
        } else {
          data.sources = [];
          data.executionSummary = { totalSources: 0, successCount: 0, errorCount: 0 };
        }

        // Create info package
        const infoPackageResult = await db.query(
          "INSERT INTO info_packages (query_id, data, directive, processed) VALUES ($1, $2, $3, false) RETURNING *",
          [queryData.id, JSON.stringify(data), queryData.directive]
        );
        
        const infoPackage = infoPackageResult.rows[0] as any;
        
        // Copy tags
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
        
        // Auto-process with AI if enabled
        if (queryData.auto_process_with_ai) {
          console.log(`[CLOUD-SCHEDULER]   → Auto-processing with AI`);
          try {
            await processInfoPackageWithAI(db, infoPackage.id, openrouterIntegration);
          } catch (error) {
            console.error(`[CLOUD-SCHEDULER]   → AI processing failed: ${(error as Error).message}`);
          }
        }

        // Update next_run_at
        const scheduleInfo = parseScheduleAndGetNextRun(queryData.schedule);
        await db.query(
          "UPDATE queries SET next_run_at = $1 WHERE id = $2",
          [scheduleInfo.nextRunAt, queryData.id]
        );

        const endTime = new Date();
        const duration = formatDuration(startTime, endTime);
        console.log(`[CLOUD-SCHEDULER] ✓ Completed: "${queryData.name}" in ${duration}`);
        
        results.push({ queryId: queryData.id, queryName: queryData.name, status: "success", duration });
      } catch (error) {
        console.error(`[CLOUD-SCHEDULER] ✗ Failed: "${queryData.name}"`, error);
        
        try {
          const scheduleInfo = parseScheduleAndGetNextRun(queryData.schedule);
          await db.query(
            "UPDATE queries SET next_run_at = $1 WHERE id = $2",
            [scheduleInfo.nextRunAt, queryData.id]
          );
        } catch (rescheduleError) {
          console.error(`[CLOUD-SCHEDULER] Failed to reschedule: ${(rescheduleError as Error).message}`);
        }
        
        results.push({ queryId: queryData.id, queryName: queryData.name, status: "error", error: (error as Error).message });
      }
    }

    return { 
      success: true, 
      message: `Executed ${results.length} quer${results.length !== 1 ? 'ies' : 'y'}`, 
      details: results 
    };
  } catch (error) {
    console.error("[CLOUD-SCHEDULER] Error in query execution:", error);
    return { 
      success: false, 
      message: "Failed to execute queries", 
      details: { error: (error as Error).message } 
    };
  }
}


/**
 * Execute all scheduled outputs that are due
 */
export async function handleOutputsExecution(): Promise<{ success: boolean; message: string; details?: any }> {
  const checkTime = new Date();
  console.log(`[CLOUD-SCHEDULER] Executing scheduled outputs... (${formatDateForLog(checkTime)})`);
  
  try {
    const outputs = await db.query(
      `SELECT * FROM outputs 
       WHERE active = true 
       AND schedule IS NOT NULL 
       AND (next_run_at IS NULL OR next_run_at <= NOW())
       ORDER BY next_run_at ASC NULLS FIRST`
    );

    if (outputs.rows.length === 0) {
      console.log("[CLOUD-SCHEDULER] No outputs due for execution");
      return { success: true, message: "No outputs due for execution" };
    }

    console.log(`[CLOUD-SCHEDULER] Found ${outputs.rows.length} output${outputs.rows.length !== 1 ? 's' : ''} due for execution`);

    const results = [];
    for (const output of outputs.rows) {
      const outputData = output as any;
      const startTime = new Date();
      console.log(`[CLOUD-SCHEDULER] Executing: "${outputData.name}" (ID: ${outputData.id})`);
      
      try {
        const outputConfig = outputData.config;
        
        // Get tag IDs
        const tagResult = await db.query(
          "SELECT tag_id FROM output_tags WHERE output_id = $1",
          [outputData.id]
        );
        const tagIds = tagResult.rows.map((row: any) => row.tag_id);

        // Calculate cutoff date
        let cutoffDate: Date;
        const cutoffDays = outputConfig.cutoff_days;
        
        if (cutoffDays === -1) {
          cutoffDate = new Date(0);
        } else if (cutoffDays) {
          cutoffDate = new Date(Date.now() - cutoffDays * 24 * 60 * 60 * 1000);
        } else {
          cutoffDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        }

        // Query content
        let contentQuery;
        if (tagIds.length > 0) {
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
             ORDER BY created_at DESC`,
            [cutoffDate.toISOString()]
          );
        }

        const contentItems = contentQuery.rows;
        const contentIds: number[] = [];
        const outputResults: any[] = [];

        if (outputData.type === "gmail") {
          try {
            const recipients = outputConfig.recipients || [outputConfig.recipient || "default@example.com"];
            const toField = recipients.join(', ');
            
            const contentItemsForEmail: Array<{content: string, date: string, citations: string[]}> = [];
            
            for (const content of contentItems) {
              const contentData = content as any;
              const contentText = contentData.edited_content || contentData.content;
              const dateStr = new Date(contentData.created_at).toLocaleString();
              const citations = contentData.citations || [];
              
              contentItemsForEmail.push({ content: contentText, date: dateStr, citations });
              contentIds.push(contentData.id);
            }
            
            const gmailResult = await gmailIntegration.sendStyledEmail({
              to: toField,
              subject: outputConfig.subject || "Content from Palimpsest",
              contentItems: contentItemsForEmail,
              labels: outputConfig.labels || [],
              outputTitle: outputData.name,
            });

            outputResults.push({ success: true, result: gmailResult });
          } catch (error) {
            outputResults.push({ success: false, error: (error as Error).message });
          }
        }

        const pgArrayFormat = contentIds.length > 0 ? `{${contentIds.join(',')}}` : '{}';
        const combinedContent = contentItems.map((c: any) => 
          c.edited_content || c.content
        ).join("\n\n---\n\n");
        
        await db.query(
          `INSERT INTO output_logs (output_id, content_ids, status, details, output_content) 
           VALUES ($1, $2, $3, $4, $5)`,
          [outputData.id, pgArrayFormat, "success", JSON.stringify(outputResults), combinedContent]
        );

        // Update next_run_at
        const scheduleInfo = parseScheduleAndGetNextRun(outputData.schedule);
        await db.query(
          "UPDATE outputs SET next_run_at = $1 WHERE id = $2",
          [scheduleInfo.nextRunAt, outputData.id]
        );

        const endTime = new Date();
        const duration = formatDuration(startTime, endTime);
        console.log(`[CLOUD-SCHEDULER] ✓ Completed: "${outputData.name}" in ${duration}`);
        
        results.push({ outputId: outputData.id, outputName: outputData.name, status: "success", contentCount: contentIds.length });
      } catch (error) {
        console.error(`[CLOUD-SCHEDULER] ✗ Failed: "${outputData.name}"`, error);
        
        try {
          const scheduleInfo = parseScheduleAndGetNextRun(outputData.schedule);
          await db.query(
            "UPDATE outputs SET next_run_at = $1 WHERE id = $2",
            [scheduleInfo.nextRunAt, outputData.id]
          );
        } catch (rescheduleError) {
          console.error(`[CLOUD-SCHEDULER] Failed to reschedule: ${(rescheduleError as Error).message}`);
        }
        
        results.push({ outputId: outputData.id, outputName: outputData.name, status: "error", error: (error as Error).message });
      }
    }

    return { 
      success: true, 
      message: `Executed ${results.length} output${results.length !== 1 ? 's' : ''}`, 
      details: results 
    };
  } catch (error) {
    console.error("[CLOUD-SCHEDULER] Error in output execution:", error);
    return { 
      success: false, 
      message: "Failed to execute outputs", 
      details: { error: (error as Error).message } 
    };
  }
}
