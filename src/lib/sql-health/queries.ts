// SQL Health Queries

export const SERVER_INFO_QUERY = `
SELECT
  @@SERVERNAME AS serverName,
  ISNULL(@@SERVICENAME, 'MSSQLSERVER') AS instanceName,
  @@VERSION AS version,
  SERVERPROPERTY('Edition') AS edition,
  SERVERPROPERTY('ProductLevel') AS productLevel,
  SERVERPROPERTY('Collation') AS collation,
  SERVERPROPERTY('IsClustered') AS isClustered,
  (SELECT cpu_count FROM sys.dm_os_sys_info) AS cpuCount,
  (SELECT physical_memory_kb/1024 FROM sys.dm_os_sys_info) AS physicalMemoryMB,
  (SELECT CAST(value_in_use AS INT) FROM sys.configurations WHERE name = 'max server memory (MB)') AS maxMemoryMB,
  (SELECT sqlserver_start_time FROM sys.dm_os_sys_info) AS lastStartTime
`

export const PERFORMANCE_METRICS_QUERY = `
SELECT
  ISNULL((
    SELECT CAST(
      SUM(CASE WHEN is_idle = 0 THEN 1 ELSE 0 END) * 100.0 /
      NULLIF(COUNT(*), 0)
    AS INT)
    FROM sys.dm_os_schedulers WITH (NOLOCK)
    WHERE scheduler_id < 255 AND status = 'VISIBLE ONLINE'
  ), 0) AS cpuPercent,
  ISNULL((SELECT TOP 1 cntr_value/1024 FROM sys.dm_os_performance_counters WITH (NOLOCK) WHERE counter_name = 'Total Server Memory (KB)'), 0) AS memoryUsedMB,
  ISNULL((SELECT TOP 1 cntr_value/1024 FROM sys.dm_os_performance_counters WITH (NOLOCK) WHERE counter_name = 'Target Server Memory (KB)'), 0) AS memoryTargetMB,
  ISNULL((SELECT TOP 1 CAST(
    (SELECT TOP 1 cntr_value FROM sys.dm_os_performance_counters WITH (NOLOCK) WHERE counter_name = 'Buffer cache hit ratio') * 100.0 /
    NULLIF((SELECT TOP 1 cntr_value FROM sys.dm_os_performance_counters WITH (NOLOCK) WHERE counter_name = 'Buffer cache hit ratio base'), 0)
  AS DECIMAL(5,2))), 0) AS bufferCacheHitRatio,
  ISNULL((SELECT TOP 1 cntr_value FROM sys.dm_os_performance_counters WITH (NOLOCK) WHERE counter_name = 'Page life expectancy' AND object_name LIKE '%Buffer Manager%'), 0) AS pageLifeExpectancy,
  ISNULL((SELECT TOP 1 cntr_value FROM sys.dm_os_performance_counters WITH (NOLOCK) WHERE counter_name = 'Batch Requests/sec'), 0) AS batchRequestsPerSec,
  ISNULL((SELECT TOP 1 cntr_value FROM sys.dm_os_performance_counters WITH (NOLOCK) WHERE counter_name = 'Transactions/sec' AND instance_name = '_Total'), 0) AS transactionsPerSec,
  ISNULL((SELECT TOP 1 cntr_value FROM sys.dm_os_performance_counters WITH (NOLOCK) WHERE counter_name = 'Number of Deadlocks/sec' AND instance_name = '_Total'), 0) AS deadlockCount,
  (SELECT COUNT(*) FROM sys.dm_exec_sessions WITH (NOLOCK) WHERE is_user_process = 1) AS totalConnections,
  (SELECT COUNT(*) FROM sys.dm_exec_requests WITH (NOLOCK) WHERE session_id > 50) AS activeConnections,
  (SELECT COUNT(*) FROM sys.dm_exec_requests WITH (NOLOCK) WHERE blocking_session_id > 0) AS blockedProcesses
`

export const ACTIVE_PROCESSES_QUERY = `
SELECT
  s.session_id AS spid,
  ISNULL(r.status, s.status) AS status,
  s.login_name AS loginName,
  ISNULL(s.host_name, '') AS hostName,
  ISNULL(DB_NAME(ISNULL(r.database_id, s.database_id)), '') AS databaseName,
  ISNULL(r.command, '') AS command,
  ISNULL(r.cpu_time, s.cpu_time) AS cpuTime,
  ISNULL(r.logical_reads, s.logical_reads) AS logicalReads,
  ISNULL(r.writes, s.writes) AS writes,
  ISNULL(DATEDIFF(MILLISECOND, r.start_time, GETDATE()), 0) AS elapsedTimeMs,
  r.wait_type AS waitType,
  ISNULL(r.wait_time, 0) AS waitTimeMs,
  NULLIF(r.blocking_session_id, 0) AS blockingSpid,
  SUBSTRING(t.text,
    (r.statement_start_offset/2) + 1,
    ((CASE r.statement_end_offset
      WHEN -1 THEN DATALENGTH(t.text)
      ELSE r.statement_end_offset
    END - r.statement_start_offset)/2) + 1
  ) AS queryText,
  ISNULL(s.program_name, '') AS programName,
  CASE WHEN s.session_id <= 50 THEN 1 ELSE 0 END AS isSystem
FROM sys.dm_exec_sessions s
LEFT JOIN sys.dm_exec_requests r ON s.session_id = r.session_id
OUTER APPLY sys.dm_exec_sql_text(r.sql_handle) t
WHERE s.session_id != @@SPID
ORDER BY ISNULL(r.cpu_time, s.cpu_time) DESC
`

export const BLOCKING_CHAINS_QUERY = `
;WITH BlockingTree AS (
  SELECT
    r.session_id AS spid,
    s.login_name AS loginName,
    DB_NAME(r.database_id) AS databaseName,
    SUBSTRING(t.text, (r.statement_start_offset/2)+1,
      ((CASE r.statement_end_offset WHEN -1 THEN DATALENGTH(t.text)
        ELSE r.statement_end_offset END - r.statement_start_offset)/2)+1) AS queryText,
    r.wait_time AS waitTimeMs,
    r.blocking_session_id AS blockedBy,
    (SELECT COUNT(*) FROM sys.dm_exec_requests r2 WHERE r2.blocking_session_id = r.session_id) AS blockingCount
  FROM sys.dm_exec_requests r
  JOIN sys.dm_exec_sessions s ON r.session_id = s.session_id
  OUTER APPLY sys.dm_exec_sql_text(r.sql_handle) t
  WHERE r.blocking_session_id > 0 OR EXISTS (
    SELECT 1 FROM sys.dm_exec_requests r2 WHERE r2.blocking_session_id = r.session_id
  )
)
SELECT * FROM BlockingTree ORDER BY blockedBy, spid
`

export const WAIT_STATS_QUERY = `
SELECT TOP 20
  wait_type AS waitType,
  CASE
    WHEN wait_type LIKE 'LCK%' THEN 'Lock'
    WHEN wait_type LIKE 'PAGEIO%' OR wait_type LIKE 'WRITELOG%' THEN 'I/O'
    WHEN wait_type LIKE 'ASYNC_NETWORK%' THEN 'Network'
    WHEN wait_type LIKE 'CXPACKET%' OR wait_type LIKE 'CXCONSUMER%' THEN 'Parallelism'
    WHEN wait_type LIKE 'SOS_SCHEDULER%' THEN 'CPU'
    WHEN wait_type LIKE 'MEMORY%' OR wait_type LIKE 'RESOURCE_SEMAPHORE%' THEN 'Memory'
    ELSE 'Other'
  END AS category,
  wait_time_ms AS waitTimeMs,
  waiting_tasks_count AS waitCount,
  CASE WHEN waiting_tasks_count > 0
    THEN wait_time_ms / waiting_tasks_count
    ELSE 0
  END AS avgWaitMs,
  CAST(100.0 * wait_time_ms / SUM(wait_time_ms) OVER() AS DECIMAL(5,2)) AS percentTotal
FROM sys.dm_os_wait_stats
WHERE wait_type NOT IN (
  'CLR_SEMAPHORE','LAZYWRITER_SLEEP','RESOURCE_QUEUE','SLEEP_TASK',
  'SLEEP_SYSTEMTASK','SQLTRACE_BUFFER_FLUSH','WAITFOR','BROKER_TO_FLUSH',
  'BROKER_TASK_STOP','DIRTY_PAGE_POLL','HADR_FILESTREAM_IOMGR_IOCOMPLETION',
  'XE_DISPATCHER_WAIT','XE_TIMER_EVENT','FT_IFTS_SCHEDULER_IDLE_WAIT'
)
AND wait_time_ms > 0
ORDER BY wait_time_ms DESC
`

export const DATABASE_STATUS_QUERY = `
SELECT
  d.name,
  d.database_id AS databaseId,
  d.state_desc AS status,
  d.recovery_model_desc AS recoveryModel,
  ISNULL(CAST(SUM(CASE WHEN mf.type = 0 THEN mf.size END) * 8.0 / 1024 AS DECIMAL(18,2)), 0) AS dataSizeMB,
  ISNULL(CAST(SUM(CASE WHEN mf.type = 1 THEN mf.size END) * 8.0 / 1024 AS DECIMAL(18,2)), 0) AS logSizeMB,
  ISNULL((SELECT TOP 1 CAST(cntr_value AS DECIMAL(5,2)) FROM sys.dm_os_performance_counters WITH (NOLOCK)
     WHERE counter_name = 'Percent Log Used' AND RTRIM(instance_name) = d.name), 0) AS logUsedPercent,
  (SELECT MAX(backup_finish_date) FROM msdb.dbo.backupset WITH (NOLOCK) WHERE database_name = d.name AND type = 'D') AS lastFullBackup,
  (SELECT MAX(backup_finish_date) FROM msdb.dbo.backupset WITH (NOLOCK) WHERE database_name = d.name AND type = 'I') AS lastDiffBackup,
  (SELECT MAX(backup_finish_date) FROM msdb.dbo.backupset WITH (NOLOCK) WHERE database_name = d.name AND type = 'L') AS lastLogBackup,
  d.compatibility_level AS compatibilityLevel
FROM sys.databases d WITH (NOLOCK)
LEFT JOIN sys.master_files mf WITH (NOLOCK) ON d.database_id = mf.database_id
WHERE d.database_id > 4
GROUP BY d.name, d.database_id, d.state_desc, d.recovery_model_desc, d.compatibility_level
ORDER BY d.name
`

export const DISK_IO_QUERY = `
SELECT
  DB_NAME(vfs.database_id) AS databaseName,
  mf.name AS fileName,
  mf.type_desc AS fileType,
  LEFT(mf.physical_name, 1) AS driveLetter,
  CASE WHEN num_of_reads > 0
    THEN CAST(io_stall_read_ms / num_of_reads AS DECIMAL(10,2))
    ELSE 0
  END AS readLatencyMs,
  CASE WHEN num_of_writes > 0
    THEN CAST(io_stall_write_ms / num_of_writes AS DECIMAL(10,2))
    ELSE 0
  END AS writeLatencyMs,
  vfs.io_stall AS pendingIO,
  CAST(num_of_bytes_read / 1048576.0 AS DECIMAL(18,2)) AS readMBps,
  CAST(num_of_bytes_written / 1048576.0 AS DECIMAL(18,2)) AS writeMBps
FROM sys.dm_io_virtual_file_stats(NULL, NULL) vfs
JOIN sys.master_files mf ON vfs.database_id = mf.database_id AND vfs.file_id = mf.file_id
WHERE vfs.database_id > 4
ORDER BY (io_stall_read_ms + io_stall_write_ms) DESC
`
