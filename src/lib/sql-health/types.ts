// SQL Health Dashboard Types

export interface ServerInfo {
  serverName: string
  instanceName: string
  version: string
  edition: string
  productLevel: string
  collation: string
  isClustered: boolean
  cpuCount: number
  physicalMemoryMB: number
  maxMemoryMB: number
  uptimeDays: number
  uptimeHours: number
  uptimeMinutes: number
  lastStartTime: Date
}

export interface PerformanceMetrics {
  cpuPercent: number
  memoryUsedMB: number
  memoryTargetMB: number
  bufferCacheHitRatio: number
  pageLifeExpectancy: number
  batchRequestsPerSec: number
  transactionsPerSec: number
  deadlockCount: number
  totalConnections: number
  activeConnections: number
  blockedProcesses: number
}

export interface ActiveProcess {
  spid: number
  status: string
  loginName: string
  hostName: string
  databaseName: string
  command: string
  cpuTime: number
  logicalReads: number
  writes: number
  elapsedTimeMs: number
  waitType: string | null
  waitTimeMs: number
  blockingSpid: number | null
  queryText: string | null
  programName: string
  isSystem: boolean
}

export interface BlockingChain {
  spid: number
  loginName: string
  databaseName: string
  queryText: string | null
  waitTimeMs: number
  blockedBy: number | null
  blockingCount: number
  children: BlockingChain[]
}

export interface WaitStatistic {
  waitType: string
  category: string
  waitTimeMs: number
  waitCount: number
  avgWaitMs: number
  percentTotal: number
}

export interface DatabaseStatus {
  name: string
  databaseId: number
  status: string
  recoveryModel: string
  dataSizeMB: number
  logSizeMB: number
  logUsedPercent: number
  lastFullBackup: Date | null
  lastDiffBackup: Date | null
  lastLogBackup: Date | null
  compatibilityLevel: number
}

export interface DiskIOStats {
  databaseName: string
  fileName: string
  fileType: string
  driveLetter: string
  readLatencyMs: number
  writeLatencyMs: number
  pendingIO: number
  readMBps: number
  writeMBps: number
}

export interface TopQuery {
  queryHash: string
  queryText: string
  executionCount: number
  avgCpuMs: number
  avgDurationMs: number
  avgLogicalReads: number
  avgWrites: number
  lastExecutionTime: Date
}

export interface JobStatus {
  jobId: string
  jobName: string
  enabled: boolean
  lastRunDate: Date | null
  lastRunStatus: string
  lastRunDurationSeconds: number
  nextRunDate: Date | null
  description: string
}

export interface MemoryBreakdown {
  bufferPoolMB: number
  planCacheMB: number
  stolenMemoryMB: number
  freeMemoryMB: number
  totalServerMemoryMB: number
  targetServerMemoryMB: number
}

export interface ConnectionSummary {
  totalConnections: number
  activeQueries: number
  sleepingConnections: number
  byApplication: { name: string; count: number }[]
  byLogin: { name: string; count: number }[]
  byDatabase: { name: string; count: number }[]
}

export interface Alert {
  severity: 'critical' | 'warning' | 'info'
  category: string
  message: string
  details?: string
}

export interface SqlHealthData {
  serverInfo: ServerInfo
  performance: PerformanceMetrics | null
  processes: ActiveProcess[]
  blockingChains: BlockingChain[]
  waitStats: WaitStatistic[]
  databases: DatabaseStatus[]
  diskIO: DiskIOStats[]
  topQueries: TopQuery[]
  jobs: JobStatus[]
  memory: MemoryBreakdown | null
  connections: ConnectionSummary | null
  alerts: Alert[]
  timestamp: Date
}
