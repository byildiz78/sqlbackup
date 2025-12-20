// SQL Health Extended Queries

export const TOP_QUERIES_QUERY = `
SELECT TOP 10
  CONVERT(VARCHAR(64), query_hash, 2) AS queryHash,
  SUBSTRING(t.text, (qs.statement_start_offset/2)+1,
    ((CASE qs.statement_end_offset
      WHEN -1 THEN DATALENGTH(t.text)
      ELSE qs.statement_end_offset
    END - qs.statement_start_offset)/2)+1) AS queryText,
  qs.execution_count AS executionCount,
  CAST(qs.total_worker_time / qs.execution_count / 1000.0 AS DECIMAL(18,2)) AS avgCpuMs,
  CAST(qs.total_elapsed_time / qs.execution_count / 1000.0 AS DECIMAL(18,2)) AS avgDurationMs,
  qs.total_logical_reads / qs.execution_count AS avgLogicalReads,
  qs.total_logical_writes / qs.execution_count AS avgWrites,
  qs.last_execution_time AS lastExecutionTime
FROM sys.dm_exec_query_stats qs
CROSS APPLY sys.dm_exec_sql_text(qs.sql_handle) t
ORDER BY qs.total_worker_time DESC
`

export const JOB_STATUS_QUERY = `
SELECT
  CONVERT(VARCHAR(64), j.job_id) AS jobId,
  j.name AS jobName,
  j.enabled,
  CASE
    WHEN h.run_date IS NOT NULL THEN
      CONVERT(DATETIME,
        STUFF(STUFF(CAST(h.run_date AS VARCHAR), 5, 0, '-'), 8, 0, '-') + ' ' +
        STUFF(STUFF(RIGHT('000000' + CAST(h.run_time AS VARCHAR), 6), 3, 0, ':'), 6, 0, ':')
      )
    ELSE NULL
  END AS lastRunDate,
  CASE h.run_status
    WHEN 0 THEN 'Failed'
    WHEN 1 THEN 'Succeeded'
    WHEN 2 THEN 'Retry'
    WHEN 3 THEN 'Canceled'
    WHEN 4 THEN 'In Progress'
    ELSE 'Unknown'
  END AS lastRunStatus,
  ISNULL(h.run_duration, 0) AS lastRunDurationSeconds,
  (
    SELECT TOP 1
      CASE
        WHEN next_run_date > 0 THEN
          CONVERT(DATETIME,
            STUFF(STUFF(CAST(next_run_date AS VARCHAR), 5, 0, '-'), 8, 0, '-') + ' ' +
            STUFF(STUFF(RIGHT('000000' + CAST(next_run_time AS VARCHAR), 6), 3, 0, ':'), 6, 0, ':')
          )
        ELSE NULL
      END
    FROM msdb.dbo.sysjobschedules js
    WHERE js.job_id = j.job_id
  ) AS nextRunDate,
  ISNULL(j.description, '') AS description
FROM msdb.dbo.sysjobs j
LEFT JOIN (
  SELECT job_id, run_date, run_time, run_status, run_duration,
    ROW_NUMBER() OVER (PARTITION BY job_id ORDER BY run_date DESC, run_time DESC) AS rn
  FROM msdb.dbo.sysjobhistory
  WHERE step_id = 0
) h ON j.job_id = h.job_id AND h.rn = 1
ORDER BY j.name
`

export const MEMORY_BREAKDOWN_QUERY = `
SELECT
  (SELECT cntr_value/1024 FROM sys.dm_os_performance_counters
   WHERE counter_name = 'Database Cache Memory (KB)') AS bufferPoolMB,
  (SELECT cntr_value/1024 FROM sys.dm_os_performance_counters
   WHERE counter_name = 'SQL Cache Memory (KB)') AS planCacheMB,
  (SELECT cntr_value/1024 FROM sys.dm_os_performance_counters
   WHERE counter_name = 'Stolen Server Memory (KB)') AS stolenMemoryMB,
  (SELECT cntr_value/1024 FROM sys.dm_os_performance_counters
   WHERE counter_name = 'Free Memory (KB)') AS freeMemoryMB,
  (SELECT cntr_value/1024 FROM sys.dm_os_performance_counters
   WHERE counter_name = 'Total Server Memory (KB)') AS totalServerMemoryMB,
  (SELECT cntr_value/1024 FROM sys.dm_os_performance_counters
   WHERE counter_name = 'Target Server Memory (KB)') AS targetServerMemoryMB
`

export const CONNECTION_SUMMARY_QUERY = `
SELECT
  (SELECT COUNT(*) FROM sys.dm_exec_sessions WHERE is_user_process = 1) AS totalConnections,
  (SELECT COUNT(*) FROM sys.dm_exec_requests WHERE session_id > 50) AS activeQueries,
  (SELECT COUNT(*) FROM sys.dm_exec_sessions s
   WHERE is_user_process = 1
   AND NOT EXISTS (SELECT 1 FROM sys.dm_exec_requests r WHERE r.session_id = s.session_id)
  ) AS sleepingConnections
`

export const CONNECTIONS_BY_APP_QUERY = `
SELECT TOP 10
  ISNULL(NULLIF(program_name, ''), 'Unknown') AS name,
  COUNT(*) AS count
FROM sys.dm_exec_sessions
WHERE is_user_process = 1
GROUP BY program_name
ORDER BY COUNT(*) DESC
`

export const CONNECTIONS_BY_LOGIN_QUERY = `
SELECT TOP 10
  login_name AS name,
  COUNT(*) AS count
FROM sys.dm_exec_sessions
WHERE is_user_process = 1
GROUP BY login_name
ORDER BY COUNT(*) DESC
`

export const CONNECTIONS_BY_DATABASE_QUERY = `
SELECT TOP 10
  ISNULL(DB_NAME(database_id), 'None') AS name,
  COUNT(*) AS count
FROM sys.dm_exec_sessions
WHERE is_user_process = 1
GROUP BY database_id
ORDER BY COUNT(*) DESC
`

export const KILL_PROCESS_QUERY = (spid: number) => `KILL ${spid}`
