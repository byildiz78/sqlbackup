import { exec, spawn } from 'child_process'
import { promisify } from 'util'
import { prisma } from './db'
import path from 'path'
import os from 'os'
import fs from 'fs'

const execAsync = promisify(exec)

// Detect if running on Windows
const isWindows = os.platform() === 'win32'

// Log entry for sync progress
export interface SyncLogEntry {
  timestamp: Date
  level: 'info' | 'warn' | 'error' | 'success'
  message: string
}

// Sync status tracking
export interface SyncStatus {
  status: 'idle' | 'initializing' | 'syncing' | 'pruning' | 'compacting' | 'completed' | 'failed'
  startedAt: Date | null
  completedAt: Date | null
  currentFile: string | null
  filesProcessed: number
  totalFiles: number
  bytesTransferred: number
  totalBytes: number
  transferSpeed: number // bytes per second
  estimatedTimeRemaining: number | null // seconds
  archiveName: string | null
  errorMessage: string | null
  bandwidthLimit: number | null // KB/s, null if unlimited
  logs: SyncLogEntry[] // Live log messages
}

// Global sync status (in-memory)
let currentSyncStatus: SyncStatus = {
  status: 'idle',
  startedAt: null,
  completedAt: null,
  currentFile: null,
  filesProcessed: 0,
  totalFiles: 0,
  bytesTransferred: 0,
  totalBytes: 0,
  transferSpeed: 0,
  estimatedTimeRemaining: null,
  archiveName: null,
  errorMessage: null,
  bandwidthLimit: null,
  logs: []
}

// Get current sync status
export function getSyncStatus(): SyncStatus {
  return { ...currentSyncStatus }
}

// Update sync status
function updateSyncStatus(updates: Partial<SyncStatus>) {
  currentSyncStatus = { ...currentSyncStatus, ...updates }
}

// Reset sync status to idle
function resetSyncStatus() {
  currentSyncStatus = {
    status: 'idle',
    startedAt: null,
    completedAt: null,
    currentFile: null,
    filesProcessed: 0,
    totalFiles: 0,
    bytesTransferred: 0,
    totalBytes: 0,
    transferSpeed: 0,
    estimatedTimeRemaining: null,
    archiveName: null,
    errorMessage: null,
    bandwidthLimit: null,
    logs: []
  }
}

// Add a log entry to sync status (keeps last 100 entries)
function addSyncLog(level: SyncLogEntry['level'], message: string) {
  const entry: SyncLogEntry = {
    timestamp: new Date(),
    level,
    message
  }
  currentSyncStatus.logs = [...currentSyncStatus.logs.slice(-99), entry]
  console.log(`[Borg][${level.toUpperCase()}] ${message}`)
}

// Format duration in human readable format
function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}m ${secs}s`
  }
  const hours = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  return `${hours}h ${mins}m`
}

// Get temp directory that works for both Windows and WSL
function getTempScriptPaths(): { windowsPath: string; wslPath: string } {
  const timestamp = Date.now()
  const filename = `borg-${timestamp}.sh`
  // Use Windows temp directory which is accessible from both Windows and WSL
  const windowsPath = path.join(os.tmpdir(), filename)
  // Convert Windows path to WSL path: C:\Users\... -> /mnt/c/Users/...
  const wslPath = windowsPath.replace(/^([A-Za-z]):/, (_, drive) => `/mnt/${drive.toLowerCase()}`).replace(/\\/g, '/')
  return { windowsPath, wslPath }
}

// Helper to run commands via WSL if on Windows
async function runCommand(cmd: string, options?: { timeout?: number; env?: NodeJS.ProcessEnv }): Promise<{ stdout: string; stderr: string }> {
  if (isWindows) {
    // On Windows, write script to temp file (accessible from WSL) and execute
    return new Promise((resolve, reject) => {
      const { windowsPath, wslPath } = getTempScriptPaths()

      // Create script content with Unix line endings
      const scriptContent = `#!/bin/bash\n${cmd}\n`

      try {
        // Write script file with Unix line endings (LF only)
        fs.writeFileSync(windowsPath, scriptContent.replace(/\r\n/g, '\n'), { encoding: 'utf8' })
      } catch (err) {
        reject(new Error(`Failed to write script file: ${err}`))
        return
      }

      // Execute the script via WSL
      const child = spawn('wsl', ['bash', wslPath], {
        timeout: options?.timeout || 60000
      })

      let stdout = ''
      let stderr = ''

      child.stdout.on('data', (data) => { stdout += data.toString() })
      child.stderr.on('data', (data) => { stderr += data.toString() })

      child.on('close', (code) => {
        // Clean up script file
        try { fs.unlinkSync(windowsPath) } catch {}

        if (code === 0) {
          resolve({ stdout, stderr })
        } else {
          const error = new Error(`Command failed with exit code ${code}: ${stderr || stdout}`)
          reject(error)
        }
      })

      child.on('error', (err) => {
        try { fs.unlinkSync(windowsPath) } catch {}
        reject(err)
      })
    })
  } else {
    // On Linux/Mac, run directly
    return execAsync(cmd, {
      timeout: options?.timeout || 60000,
      env: options?.env || process.env,
      maxBuffer: 100 * 1024 * 1024 // 100MB buffer for large outputs
    })
  }
}

// Borg configuration from environment
const BORG_CONFIG = {
  host: process.env.BORG_REPO_HOST || '',
  user: process.env.BORG_REPO_USER || '',
  port: process.env.BORG_REPO_PORT || '23',
  password: process.env.BORG_REPO_PASSWORD || '',
  repoPath: process.env.BORG_REPO_PATH || '/./backups/sqlbackups',
  passphrase: process.env.BORG_PASSPHRASE || '',
}

// Bandwidth settings interface
export interface BandwidthSettings {
  enabled: boolean
  peakLimitKBps: number      // KB/s during peak hours
  offpeakLimitKBps: number   // KB/s during off-peak (0 = unlimited)
  peakStartHour: number      // e.g., 8 for 08:00
  peakEndHour: number        // e.g., 20 for 20:00
  weekendUnlimited: boolean
}

// Get bandwidth settings from database
export async function getBandwidthSettings(): Promise<BandwidthSettings> {
  const defaults: BandwidthSettings = {
    enabled: true,
    peakLimitKBps: 5000,      // 5 MB/s default
    offpeakLimitKBps: 0,      // Unlimited at night
    peakStartHour: 8,
    peakEndHour: 20,
    weekendUnlimited: true
  }

  try {
    const settings = await prisma.setting.findMany({
      where: {
        key: {
          in: [
            'borg_bandwidth_limit_enabled',
            'borg_bandwidth_peak_limit',
            'borg_bandwidth_offpeak_limit',
            'borg_bandwidth_peak_start',
            'borg_bandwidth_peak_end',
            'borg_bandwidth_weekend_unlimited'
          ]
        }
      }
    })

    const settingsMap: Record<string, string> = {}
    for (const s of settings) {
      settingsMap[s.key] = s.value
    }

    return {
      enabled: settingsMap['borg_bandwidth_limit_enabled'] !== 'false',
      peakLimitKBps: parseInt(settingsMap['borg_bandwidth_peak_limit'] || '5000', 10),
      offpeakLimitKBps: parseInt(settingsMap['borg_bandwidth_offpeak_limit'] || '0', 10),
      peakStartHour: parseInt(settingsMap['borg_bandwidth_peak_start']?.split(':')[0] || '8', 10),
      peakEndHour: parseInt(settingsMap['borg_bandwidth_peak_end']?.split(':')[0] || '20', 10),
      weekendUnlimited: settingsMap['borg_bandwidth_weekend_unlimited'] !== 'false'
    }
  } catch (error) {
    console.error('[Borg] Failed to get bandwidth settings:', error)
    return defaults
  }
}

// Calculate current bandwidth limit based on time of day and settings
export async function getCurrentBandwidthLimit(): Promise<number> {
  const settings = await getBandwidthSettings()

  if (!settings.enabled) {
    return 0 // No limit
  }

  const now = new Date()
  const hour = now.getHours()
  const dayOfWeek = now.getDay() // 0 = Sunday, 6 = Saturday

  // Check if weekend
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
  if (isWeekend && settings.weekendUnlimited) {
    console.log('[Borg] Weekend - no bandwidth limit')
    return 0
  }

  // Check if peak hours
  const isPeakHours = hour >= settings.peakStartHour && hour < settings.peakEndHour

  if (isPeakHours) {
    console.log(`[Borg] Peak hours (${settings.peakStartHour}:00-${settings.peakEndHour}:00) - limit: ${settings.peakLimitKBps} KB/s`)
    return settings.peakLimitKBps
  } else {
    console.log(`[Borg] Off-peak hours - limit: ${settings.offpeakLimitKBps === 0 ? 'unlimited' : settings.offpeakLimitKBps + ' KB/s'}`)
    return settings.offpeakLimitKBps
  }
}

// Get full repository URL
export function getRepoUrl(): string {
  return `ssh://${BORG_CONFIG.user}@${BORG_CONFIG.host}:${BORG_CONFIG.port}${BORG_CONFIG.repoPath}`
}

// Build a borg command with all env vars inline (works with WSL)
function buildBorgCommand(borgArgs: string): string {
  // SSH options to keep connection alive and prevent timeout
  const sshOptions = [
    '-o StrictHostKeyChecking=no',
    '-o ServerAliveInterval=30',      // Send keep-alive every 30 seconds
    '-o ServerAliveCountMax=10',      // Allow 10 missed keep-alives before disconnect
    '-o TCPKeepAlive=yes',            // Enable TCP keep-alive
    '-o ConnectionAttempts=3',        // Retry connection 3 times
    `-p ${BORG_CONFIG.port}`
  ].join(' ')

  const envVars = [
    `BORG_PASSPHRASE='${BORG_CONFIG.passphrase}'`,
    `BORG_RSH="sshpass -p '${BORG_CONFIG.password}' ssh ${sshOptions}"`,
    `BORG_UNKNOWN_UNENCRYPTED_REPO_ACCESS_IS_OK=yes`,
    `BORG_RELOCATED_REPO_ACCESS_IS_OK=yes`
  ].join(' ')

  return `${envVars} borg ${borgArgs}`
}

// Run a borg command
async function runBorgCommand(borgArgs: string, timeout: number = 60000): Promise<{ stdout: string; stderr: string }> {
  const cmd = buildBorgCommand(borgArgs)
  return runCommand(cmd, { timeout })
}

export interface BorgInfo {
  totalSize: number
  totalCsize: number
  uniqueSize: number
  uniqueCsize: number
  totalChunks: number
  uniqueChunks: number
}

export interface BorgArchive {
  name: string
  start: string
  end: string
  duration: number
  stats: {
    originalSize: number
    compressedSize: number
    deduplicatedSize: number
    nfiles: number
  }
}

export interface BorgStatus {
  initialized: boolean
  connected: boolean
  lastSync: string | null
  lastError: string | null
  repoInfo: BorgInfo | null
  archives: BorgArchive[]
  archiveCount: number
}

// Check if borg is installed
export async function checkBorgInstalled(): Promise<boolean> {
  try {
    await runCommand('borg --version')
    return true
  } catch {
    return false
  }
}

// Check if sshpass is installed
export async function checkSshpassInstalled(): Promise<boolean> {
  try {
    await runCommand('sshpass -V')
    return true
  } catch {
    return false
  }
}

// Test connection to Hetzner StorageBox
export async function testConnection(): Promise<{ success: boolean; error?: string }> {
  try {
    const sshOptions = '-o StrictHostKeyChecking=no -o ConnectTimeout=30'
    const cmd = `sshpass -p '${BORG_CONFIG.password}' ssh ${sshOptions} -p ${BORG_CONFIG.port} ${BORG_CONFIG.user}@${BORG_CONFIG.host} "ls"`
    await runCommand(cmd, { timeout: 30000 })
    return { success: true }
  } catch (error) {
    // StorageBox returns exit code 1 for some commands but connection works
    const msg = error instanceof Error ? error.message : ''
    if (msg.includes('Permission denied') || msg.includes('Authentication failed')) {
      return { success: false, error: 'Authentication failed' }
    }
    // If we got any response, connection works
    return { success: true }
  }
}

// Storage quota info interface
export interface StorageQuota {
  totalBytes: number
  usedBytes: number
  freeBytes: number
  usedPercent: number
}

// Get storage quota from Hetzner StorageBox
export async function getStorageQuota(): Promise<StorageQuota | null> {
  try {
    // Use df command to get disk usage on StorageBox
    const sshOptions = '-o StrictHostKeyChecking=no -o ConnectTimeout=30'
    const cmd = `sshpass -p '${BORG_CONFIG.password}' ssh ${sshOptions} -p ${BORG_CONFIG.port} ${BORG_CONFIG.user}@${BORG_CONFIG.host} "df -B1 ."`
    const { stdout } = await runCommand(cmd, { timeout: 30000 })

    // Parse df output
    // Format: Filesystem     1B-blocks         Used    Available Use% Mounted on
    const lines = stdout.trim().split('\n')
    if (lines.length < 2) return null

    const dataLine = lines[1]
    const parts = dataLine.split(/\s+/)

    // parts: [Filesystem, 1B-blocks, Used, Available, Use%, Mounted]
    if (parts.length < 5) return null

    const totalBytes = parseInt(parts[1], 10) || 0
    const usedBytes = parseInt(parts[2], 10) || 0
    const freeBytes = parseInt(parts[3], 10) || 0
    const usedPercent = parseInt(parts[4].replace('%', ''), 10) || 0

    return {
      totalBytes,
      usedBytes,
      freeBytes,
      usedPercent
    }
  } catch (error) {
    console.error('[Borg] Failed to get storage quota:', error)
    return null
  }
}

// Initialize borg repository
export async function initRepository(): Promise<{ success: boolean; error?: string }> {
  try {
    const repoUrl = getRepoUrl()
    console.log(`[Borg] Initializing repository: ${repoUrl}`)

    const { stdout, stderr } = await runBorgCommand(
      `init --encryption=repokey-blake2 ${repoUrl}`,
      120000
    )

    console.log('[Borg] Repository initialized successfully')
    console.log('[Borg] stdout:', stdout)
    if (stderr) console.log('[Borg] stderr:', stderr)

    return { success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Init failed'
    // Check if repo already exists
    if (message.includes('already exists') || message.includes('repository already exists')) {
      console.log('[Borg] Repository already exists')
      return { success: true }
    }
    console.error('[Borg] Init error:', message)
    return { success: false, error: message }
  }
}

// Get repository info
export async function getRepoInfo(): Promise<BorgInfo | null> {
  try {
    const repoUrl = getRepoUrl()
    const { stdout } = await runBorgCommand(`info --json ${repoUrl}`)

    const info = JSON.parse(stdout)
    return {
      totalSize: info.cache?.stats?.total_size || 0,
      totalCsize: info.cache?.stats?.total_csize || 0,
      uniqueSize: info.cache?.stats?.unique_size || 0,
      uniqueCsize: info.cache?.stats?.unique_csize || 0,
      totalChunks: info.cache?.stats?.total_chunks || 0,
      uniqueChunks: info.cache?.stats?.unique_chunks || 0,
    }
  } catch (error) {
    console.error('[Borg] Get info error:', error)
    return null
  }
}

// List archives
export async function listArchives(): Promise<BorgArchive[]> {
  try {
    const repoUrl = getRepoUrl()
    const { stdout } = await runBorgCommand(`list --json ${repoUrl}`)

    const data = JSON.parse(stdout)
    return (data.archives || []).map((a: { name: string; start: string; time: string }) => ({
      name: a.name,
      start: a.start || a.time,
      end: a.start || a.time,
      duration: 0,
      stats: {
        originalSize: 0,
        compressedSize: 0,
        deduplicatedSize: 0,
        nfiles: 0,
      }
    }))
  } catch (error) {
    console.error('[Borg] List archives error:', error)
    return []
  }
}

// Create a new backup archive
export async function createArchive(
  sourcePath: string,
  archiveName?: string,
  bandwidthLimitKBps?: number
): Promise<{ success: boolean; archiveName?: string; stats?: object; error?: string }> {
  try {
    const repoUrl = getRepoUrl()
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const name = archiveName || `backup-${timestamp}`

    console.log(`[Borg] Creating archive: ${name}`)
    console.log(`[Borg] Source path: ${sourcePath}`)

    // Convert Windows path to WSL path if needed
    let wslPath = sourcePath
    if (isWindows && sourcePath.match(/^[A-Za-z]:\\/)) {
      // Convert C:\path to /mnt/c/path
      wslPath = sourcePath.replace(/^([A-Za-z]):/, (_, drive) => `/mnt/${drive.toLowerCase()}`).replace(/\\/g, '/')
    }

    // Build borg create command with optional bandwidth limit
    let borgArgs = `create --stats --compression lz4`
    if (bandwidthLimitKBps && bandwidthLimitKBps > 0) {
      borgArgs += ` --remote-ratelimit=${bandwidthLimitKBps}`
      console.log(`[Borg] Using bandwidth limit: ${bandwidthLimitKBps} KB/s (${(bandwidthLimitKBps / 1024).toFixed(1)} MB/s)`)
    }
    borgArgs += ` ${repoUrl}::${name} "${wslPath}"`

    // Create archive with compression and stats
    const { stdout, stderr } = await runBorgCommand(
      borgArgs,
      21600000 // 6 hours timeout for large backups
    )

    let stats = {}
    try {
      if (stdout) stats = JSON.parse(stdout)
    } catch {
      // Stats parsing failed, not critical
    }

    console.log(`[Borg] Archive created: ${name}`)
    if (stderr) console.log('[Borg] stderr:', stderr)

    // Save sync record
    await saveSyncRecord(name, 'success')

    return { success: true, archiveName: name, stats }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Create archive failed'
    console.error('[Borg] Create archive error:', message)
    await saveSyncRecord(archiveName || 'unknown', 'failed', message)
    return { success: false, error: message }
  }
}

// Prune old archives based on retention policy
export async function pruneArchives(
  keepDaily: number = 7,
  keepWeekly: number = 4,
  keepMonthly: number = 6
): Promise<{ success: boolean; pruned?: number; error?: string }> {
  try {
    const repoUrl = getRepoUrl()
    console.log(`[Borg] Pruning archives (keep: ${keepDaily}d, ${keepWeekly}w, ${keepMonthly}m)`)

    const { stdout, stderr } = await runBorgCommand(
      `prune --stats --keep-daily=${keepDaily} --keep-weekly=${keepWeekly} --keep-monthly=${keepMonthly} ${repoUrl}`,
      300000 // 5 minute timeout
    )

    console.log('[Borg] Prune completed')
    if (stdout) console.log('[Borg] stdout:', stdout)
    if (stderr) console.log('[Borg] stderr:', stderr)

    return { success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Prune failed'
    console.error('[Borg] Prune error:', message)
    return { success: false, error: message }
  }
}

// Compact repository (reclaim space after prune)
export async function compactRepository(): Promise<{ success: boolean; error?: string }> {
  try {
    const repoUrl = getRepoUrl()
    console.log('[Borg] Compacting repository')

    await runBorgCommand(`compact ${repoUrl}`, 600000) // 10 minute timeout

    console.log('[Borg] Compact completed')
    return { success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Compact failed'
    console.error('[Borg] Compact error:', message)
    return { success: false, error: message }
  }
}

// Get full status
export async function getStatus(): Promise<BorgStatus> {
  const status: BorgStatus = {
    initialized: false,
    connected: false,
    lastSync: null,
    lastError: null,
    repoInfo: null,
    archives: [],
    archiveCount: 0,
  }

  try {
    // Check connection
    const connectionTest = await testConnection()
    status.connected = connectionTest.success

    if (!status.connected) {
      status.lastError = connectionTest.error || 'Connection failed'
      return status
    }

    // Get repo info
    const repoInfo = await getRepoInfo()
    if (repoInfo) {
      status.initialized = true
      status.repoInfo = repoInfo
    }

    // Get archives
    const archives = await listArchives()
    status.archives = archives.slice(-10) // Last 10 archives
    status.archiveCount = archives.length

    // Get last sync from database
    const lastSync = await getLastSyncRecord()
    if (lastSync) {
      status.lastSync = lastSync.createdAt.toISOString()
      if (lastSync.status === 'failed') {
        status.lastError = lastSync.errorMsg || 'Unknown error'
      }
    }
  } catch (error) {
    status.lastError = error instanceof Error ? error.message : 'Status check failed'
  }

  return status
}

// Save sync record to database
async function saveSyncRecord(archiveName: string, status: string, errorMsg?: string) {
  try {
    await prisma.setting.upsert({
      where: { key: 'borg_last_sync' },
      update: {
        value: JSON.stringify({
          archiveName,
          status,
          errorMsg,
          timestamp: new Date().toISOString()
        })
      },
      create: {
        key: 'borg_last_sync',
        value: JSON.stringify({
          archiveName,
          status,
          errorMsg,
          timestamp: new Date().toISOString()
        })
      }
    })
  } catch (error) {
    console.error('[Borg] Failed to save sync record:', error)
  }
}

// Get last sync record
async function getLastSyncRecord(): Promise<{ archiveName: string; status: string; errorMsg?: string; createdAt: Date } | null> {
  try {
    const record = await prisma.setting.findFirst({
      where: { key: 'borg_last_sync' }
    })

    if (record?.value) {
      const data = JSON.parse(record.value)
      return {
        ...data,
        createdAt: new Date(data.timestamp)
      }
    }
  } catch {
    // Record not found
  }
  return null
}

// Count files and total size in a directory
async function countFilesInPath(dirPath: string): Promise<{ fileCount: number; totalSize: number }> {
  try {
    // Convert Windows path to WSL path if needed
    let wslPath = dirPath
    if (isWindows && dirPath.match(/^[A-Za-z]:\\/)) {
      wslPath = dirPath.replace(/^([A-Za-z]):/, (_, drive) => `/mnt/${drive.toLowerCase()}`).replace(/\\/g, '/')
    }

    const { stdout } = await runCommand(`find "${wslPath}" -type f -exec stat --format="%s" {} \\; 2>/dev/null | awk '{count++; total+=$1} END {print count, total}'`, { timeout: 30000 })
    const parts = stdout.trim().split(' ')
    return {
      fileCount: parseInt(parts[0] || '0', 10) || 0,
      totalSize: parseInt(parts[1] || '0', 10) || 0
    }
  } catch {
    return { fileCount: 0, totalSize: 0 }
  }
}

// Sync backup folder to Hetzner
export async function syncBackupFolder(backupPath: string): Promise<{ success: boolean; error?: string; historyId?: string }> {
  const startTime = new Date()

  // Create history record
  let historyRecord: { id: string } | null = null
  try {
    historyRecord = await prisma.borgSyncHistory.create({
      data: {
        startedAt: startTime,
        status: 'running'
      }
    })
  } catch (err) {
    console.error('[Borg] Failed to create history record:', err)
  }

  // Initialize sync status
  updateSyncStatus({
    status: 'initializing',
    startedAt: startTime,
    completedAt: null,
    currentFile: null,
    filesProcessed: 0,
    totalFiles: 0,
    bytesTransferred: 0,
    totalBytes: 0,
    transferSpeed: 0,
    estimatedTimeRemaining: null,
    archiveName: null,
    errorMessage: null,
    bandwidthLimit: null,
    logs: []
  })

  addSyncLog('info', `Starting sync for: ${backupPath}`)

  // Helper to update history on failure
  const updateHistoryOnFailure = async (errorMsg: string) => {
    if (historyRecord) {
      try {
        await prisma.borgSyncHistory.update({
          where: { id: historyRecord.id },
          data: {
            status: 'failed',
            completedAt: new Date(),
            errorMsg,
            duration: Math.round((Date.now() - startTime.getTime()) / 1000)
          }
        })
      } catch (err) {
        console.error('[Borg] Failed to update history record:', err)
      }
    }
  }

  try {
    // Check if borg is installed
    addSyncLog('info', 'Checking BorgBackup installation...')
    const borgInstalled = await checkBorgInstalled()
    if (!borgInstalled) {
      addSyncLog('error', 'BorgBackup is not installed')
      updateSyncStatus({ status: 'failed', errorMessage: 'BorgBackup is not installed', completedAt: new Date() })
      await updateHistoryOnFailure('BorgBackup is not installed')
      return { success: false, error: 'BorgBackup is not installed', historyId: historyRecord?.id }
    }
    addSyncLog('success', 'BorgBackup is installed')

    // Check if sshpass is installed
    addSyncLog('info', 'Checking sshpass installation...')
    const sshpassInstalled = await checkSshpassInstalled()
    if (!sshpassInstalled) {
      addSyncLog('error', 'sshpass is not installed')
      updateSyncStatus({ status: 'failed', errorMessage: 'sshpass is not installed', completedAt: new Date() })
      await updateHistoryOnFailure('sshpass is not installed')
      return { success: false, error: 'sshpass is not installed', historyId: historyRecord?.id }
    }
    addSyncLog('success', 'sshpass is installed')

    // Count files in backup folder
    addSyncLog('info', 'Counting files in backup folder...')
    const { fileCount, totalSize } = await countFilesInPath(backupPath)
    updateSyncStatus({ totalFiles: fileCount, totalBytes: totalSize })
    addSyncLog('info', `Found ${fileCount} files, ${formatBytes(totalSize)} total`)

    // Initialize repo if needed
    addSyncLog('info', 'Checking repository...')
    const initResult = await initRepository()
    if (!initResult.success) {
      const errorMsg = `Repository init failed: ${initResult.error}`
      addSyncLog('error', errorMsg)
      updateSyncStatus({ status: 'failed', errorMessage: errorMsg, completedAt: new Date() })
      await updateHistoryOnFailure(errorMsg)
      return { success: false, error: errorMsg, historyId: historyRecord?.id }
    }
    addSyncLog('success', 'Repository ready')

    // Get current bandwidth limit based on time of day
    const bandwidthLimit = await getCurrentBandwidthLimit()
    if (bandwidthLimit > 0) {
      addSyncLog('info', `Bandwidth limit: ${(bandwidthLimit / 1024).toFixed(1)} MB/s`)
    } else {
      addSyncLog('info', 'No bandwidth limit')
    }
    updateSyncStatus({
      status: 'syncing',
      bandwidthLimit: bandwidthLimit > 0 ? bandwidthLimit : null
    })

    // Create archive with bandwidth limit
    const archiveName = `sql-backup-${new Date().toISOString().split('T')[0]}-${Date.now()}`
    updateSyncStatus({ archiveName })
    addSyncLog('info', `Creating archive: ${archiveName}`)
    addSyncLog('info', 'Connecting to Hetzner StorageBox...')

    const createResult = await createArchiveWithProgress(backupPath, archiveName, bandwidthLimit)
    if (!createResult.success) {
      const errorMsg = `Archive creation failed: ${createResult.error}`
      addSyncLog('error', errorMsg)
      updateSyncStatus({ status: 'failed', errorMessage: errorMsg, completedAt: new Date() })
      await updateHistoryOnFailure(errorMsg)
      return { success: false, error: errorMsg, historyId: historyRecord?.id }
    }
    addSyncLog('success', 'Archive created successfully')

    // Prune old archives
    addSyncLog('info', 'Pruning old archives...')
    updateSyncStatus({ status: 'pruning' })
    await pruneArchives()
    addSyncLog('success', 'Pruning completed')

    // Compact repository
    addSyncLog('info', 'Compacting repository...')
    updateSyncStatus({ status: 'compacting' })
    await compactRepository()
    addSyncLog('success', 'Compacting completed')

    // Mark as completed
    const endTime = new Date()
    const duration = Math.round((endTime.getTime() - startTime.getTime()) / 1000)
    addSyncLog('success', `Sync completed in ${formatDuration(duration)}`)
    updateSyncStatus({
      status: 'completed',
      completedAt: endTime,
      filesProcessed: fileCount,
      bytesTransferred: totalSize,
      transferSpeed: duration > 0 ? Math.round(totalSize / duration) : 0,
      estimatedTimeRemaining: 0
    })

    // Update history record with success
    if (historyRecord) {
      try {
        // Parse stats from createResult if available
        const stats = createResult.stats as { nfiles?: number; original_size?: number; compressed_size?: number; deduplicated_size?: number } | undefined

        await prisma.borgSyncHistory.update({
          where: { id: historyRecord.id },
          data: {
            status: 'success',
            completedAt: endTime,
            duration,
            filesTotal: stats?.nfiles || fileCount,
            filesNew: stats?.nfiles || 0,
            sizeOriginal: stats?.original_size ? stats.original_size / (1024 * 1024) : totalSize / (1024 * 1024),
            sizeCompressed: stats?.compressed_size ? stats.compressed_size / (1024 * 1024) : null,
            sizeDeduplicated: stats?.deduplicated_size ? stats.deduplicated_size / (1024 * 1024) : null
          }
        })
      } catch (err) {
        console.error('[Borg] Failed to update history record:', err)
      }
    }

    return { success: true, historyId: historyRecord?.id }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Sync failed'
    addSyncLog('error', `Sync failed: ${message}`)
    updateSyncStatus({ status: 'failed', errorMessage: message, completedAt: new Date() })
    await updateHistoryOnFailure(message)
    return { success: false, error: message, historyId: historyRecord?.id }
  }
}

// Create archive with progress tracking
async function createArchiveWithProgress(
  sourcePath: string,
  archiveName: string,
  bandwidthLimitKBps?: number
): Promise<{ success: boolean; archiveName?: string; stats?: object; error?: string }> {
  try {
    const repoUrl = getRepoUrl()

    console.log(`[Borg] Creating archive: ${archiveName}`)
    console.log(`[Borg] Source path: ${sourcePath}`)

    // Convert Windows path to WSL path if needed
    let wslPath = sourcePath
    if (isWindows && sourcePath.match(/^[A-Za-z]:\\/)) {
      wslPath = sourcePath.replace(/^([A-Za-z]):/, (_, drive) => `/mnt/${drive.toLowerCase()}`).replace(/\\/g, '/')
    }

    // Build borg create command with progress and optional bandwidth limit
    let borgArgs = `create --stats --progress --compression lz4`
    if (bandwidthLimitKBps && bandwidthLimitKBps > 0) {
      borgArgs += ` --remote-ratelimit=${bandwidthLimitKBps}`
      console.log(`[Borg] Using bandwidth limit: ${bandwidthLimitKBps} KB/s (${(bandwidthLimitKBps / 1024).toFixed(1)} MB/s)`)
    }
    borgArgs += ` ${repoUrl}::${archiveName} "${wslPath}"`

    // Run with progress parsing
    const result = await runBorgCommandWithProgress(borgArgs, 21600000) // 6 hours

    console.log(`[Borg] Archive created: ${archiveName}`)

    // Save sync record
    await saveSyncRecord(archiveName, 'success')

    return { success: true, archiveName, stats: result.stats }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Create archive failed'
    console.error('[Borg] Create archive error:', message)
    await saveSyncRecord(archiveName || 'unknown', 'failed', message)
    return { success: false, error: message }
  }
}

// Run borg command with progress parsing
async function runBorgCommandWithProgress(borgArgs: string, timeout: number): Promise<{ stdout: string; stderr: string; stats: object }> {
  const cmd = buildBorgCommand(borgArgs)

  return new Promise((resolve, reject) => {
    if (isWindows) {
      const { windowsPath, wslPath } = getTempScriptPaths()
      const scriptContent = `#!/bin/bash\n${cmd}\n`

      try {
        fs.writeFileSync(windowsPath, scriptContent.replace(/\r\n/g, '\n'), { encoding: 'utf8' })
      } catch (err) {
        reject(new Error(`Failed to write script file: ${err}`))
        return
      }

      const child = spawn('wsl', ['bash', wslPath], { timeout })

      let stdout = ''
      let stderr = ''
      let lastProgressUpdate = Date.now()
      const startTime = Date.now()

      child.stdout.on('data', (data) => {
        stdout += data.toString()
      })

      let lastLogUpdate = 0
      let connectionLogged = false

      child.stderr.on('data', (data) => {
        const text = data.toString()
        stderr += text

        // Parse progress from borg output (appears on stderr)
        // Borg progress format: "O 1.23 GB, C 456 MB, D 789 MB, N path/to/file"
        // Or: "1.23 GB O 456 MB C 789 MB D 123 files"
        const now = Date.now()
        if (now - lastProgressUpdate > 500) { // Update at most every 500ms
          lastProgressUpdate = now

          // Try to extract transferred bytes from progress
          const gbMatch = text.match(/(\d+\.?\d*)\s*GB/i)
          const mbMatch = text.match(/(\d+\.?\d*)\s*MB/i)
          const kbMatch = text.match(/(\d+\.?\d*)\s*KB/i)

          let bytesTransferred = 0
          if (gbMatch) bytesTransferred = parseFloat(gbMatch[1]) * 1024 * 1024 * 1024
          else if (mbMatch) bytesTransferred = parseFloat(mbMatch[1]) * 1024 * 1024
          else if (kbMatch) bytesTransferred = parseFloat(kbMatch[1]) * 1024

          // Extract current file
          const fileMatch = text.match(/[OCDN]\s+[\d.]+\s*[GMKB]+[^,]*,\s*[OCDN]\s+[\d.]+\s*[GMKB]+[^,]*,\s*[OCDN]\s+[\d.]+\s*[GMKB]+[^,]*,\s*[OCDN]\s+(.+)$/m)
          const currentFile = fileMatch ? fileMatch[1].trim() : null

          // Calculate speed
          const elapsedSeconds = (now - startTime) / 1000
          const speed = elapsedSeconds > 0 ? Math.round(bytesTransferred / elapsedSeconds) : 0

          // Estimate remaining time
          const status = getSyncStatus()
          const remaining = status.totalBytes > 0 && speed > 0
            ? Math.round((status.totalBytes - bytesTransferred) / speed)
            : null

          if (bytesTransferred > 0) {
            // Log connection success once
            if (!connectionLogged) {
              connectionLogged = true
              addSyncLog('success', 'Connected to Hetzner StorageBox')
              addSyncLog('info', 'Transferring files...')
            }

            updateSyncStatus({
              bytesTransferred,
              currentFile,
              transferSpeed: speed,
              estimatedTimeRemaining: remaining
            })

            // Add progress log every 30 seconds
            if (now - lastLogUpdate > 30000) {
              lastLogUpdate = now
              const speedMBs = (speed / (1024 * 1024)).toFixed(1)
              const transferredGB = (bytesTransferred / (1024 * 1024 * 1024)).toFixed(2)
              const remainingStr = remaining ? ` - ETA: ${Math.round(remaining / 60)} min` : ''
              addSyncLog('info', `Progress: ${transferredGB} GB @ ${speedMBs} MB/s${remainingStr}`)
            }
          }
        }
      })

      child.on('close', (code) => {
        try { fs.unlinkSync(windowsPath) } catch {}

        if (code === 0) {
          resolve({ stdout, stderr, stats: {} })
        } else {
          reject(new Error(`Command failed with exit code ${code}: ${stderr || stdout}`))
        }
      })

      child.on('error', (err) => {
        try { fs.unlinkSync(windowsPath) } catch {}
        reject(err)
      })
    } else {
      // Linux/Mac - use spawn for streaming progress
      const child = spawn('bash', ['-c', cmd], { timeout })

      let stdout = ''
      let stderr = ''
      let lastProgressUpdate = Date.now()
      let lastLogUpdate = 0
      let connectionLogged = false
      const startTime = Date.now()

      child.stdout.on('data', (data) => {
        stdout += data.toString()
      })

      child.stderr.on('data', (data) => {
        const text = data.toString()
        stderr += text

        // Parse progress from borg output
        const now = Date.now()
        if (now - lastProgressUpdate > 500) {
          lastProgressUpdate = now

          const gbMatch = text.match(/(\d+\.?\d*)\s*GB/i)
          const mbMatch = text.match(/(\d+\.?\d*)\s*MB/i)
          const kbMatch = text.match(/(\d+\.?\d*)\s*KB/i)

          let bytesTransferred = 0
          if (gbMatch) bytesTransferred = parseFloat(gbMatch[1]) * 1024 * 1024 * 1024
          else if (mbMatch) bytesTransferred = parseFloat(mbMatch[1]) * 1024 * 1024
          else if (kbMatch) bytesTransferred = parseFloat(kbMatch[1]) * 1024

          const fileMatch = text.match(/[OCDN]\s+[\d.]+\s*[GMKB]+[^,]*,\s*[OCDN]\s+[\d.]+\s*[GMKB]+[^,]*,\s*[OCDN]\s+[\d.]+\s*[GMKB]+[^,]*,\s*[OCDN]\s+(.+)$/m)
          const currentFile = fileMatch ? fileMatch[1].trim() : null

          const elapsedSeconds = (now - startTime) / 1000
          const speed = elapsedSeconds > 0 ? Math.round(bytesTransferred / elapsedSeconds) : 0

          const status = getSyncStatus()
          const remaining = status.totalBytes > 0 && speed > 0
            ? Math.round((status.totalBytes - bytesTransferred) / speed)
            : null

          if (bytesTransferred > 0) {
            if (!connectionLogged) {
              connectionLogged = true
              addSyncLog('success', 'Connected to Hetzner StorageBox')
              addSyncLog('info', 'Transferring files...')
            }

            updateSyncStatus({
              bytesTransferred,
              currentFile,
              transferSpeed: speed,
              estimatedTimeRemaining: remaining
            })

            if (now - lastLogUpdate > 30000) {
              lastLogUpdate = now
              const speedMBs = (speed / (1024 * 1024)).toFixed(1)
              const transferredGB = (bytesTransferred / (1024 * 1024 * 1024)).toFixed(2)
              const remainingStr = remaining ? ` - ETA: ${Math.round(remaining / 60)} min` : ''
              addSyncLog('info', `Progress: ${transferredGB} GB @ ${speedMBs} MB/s${remainingStr}`)
            }
          }
        }
      })

      child.on('close', (code) => {
        if (code === 0) {
          resolve({ stdout, stderr, stats: {} })
        } else {
          reject(new Error(`Command failed with exit code ${code}: ${stderr || stdout}`))
        }
      })

      child.on('error', (err) => {
        reject(err)
      })
    }
  })
}

// Format bytes to human readable
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

// List files in an archive
export interface ArchiveFile {
  path: string
  type: string // 'd' for directory, '-' for file
  size: number
  mtime: string
}

export async function listArchiveContents(archiveName: string): Promise<{ success: boolean; files?: ArchiveFile[]; error?: string }> {
  try {
    const repoUrl = getRepoUrl()
    console.log(`[Borg] Listing contents of archive: ${archiveName}`)

    const { stdout } = await runBorgCommand(
      `list --json-lines ${repoUrl}::${archiveName}`,
      120000 // 2 minute timeout
    )

    const files: ArchiveFile[] = []
    const lines = stdout.trim().split('\n').filter(Boolean)

    for (const line of lines) {
      try {
        const item = JSON.parse(line)
        files.push({
          path: item.path,
          type: item.type === 'd' ? 'd' : '-',
          size: item.size || 0,
          mtime: item.mtime || ''
        })
      } catch {
        // Skip invalid lines
      }
    }

    console.log(`[Borg] Found ${files.length} items in archive`)
    return { success: true, files }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'List contents failed'
    console.error('[Borg] List contents error:', message)
    return { success: false, error: message }
  }
}

// Extract files from an archive
export async function extractArchive(
  archiveName: string,
  destinationPath: string,
  specificPaths?: string[]
): Promise<{ success: boolean; extractedTo?: string; error?: string }> {
  try {
    const repoUrl = getRepoUrl()
    console.log(`[Borg] Extracting archive: ${archiveName} to ${destinationPath}`)

    // Convert Windows path to WSL path if needed
    let wslDestPath = destinationPath
    if (isWindows && destinationPath.match(/^[A-Za-z]:\\/)) {
      wslDestPath = destinationPath.replace(/^([A-Za-z]):/, (_, drive) => `/mnt/${drive.toLowerCase()}`).replace(/\\/g, '/')
    }

    // Create destination directory
    await runCommand(`mkdir -p "${wslDestPath}"`)

    // Build extract command
    let extractCmd = `cd "${wslDestPath}" && `
    extractCmd += `borg extract ${repoUrl}::${archiveName}`

    // Add specific paths if provided
    if (specificPaths && specificPaths.length > 0) {
      extractCmd += ' ' + specificPaths.map(p => `"${p}"`).join(' ')
    }

    // Run with borg env vars
    const fullCmd = buildBorgCommandForExtract(extractCmd)
    await runCommand(fullCmd, { timeout: 21600000 }) // 6 hours timeout for large extracts

    console.log(`[Borg] Archive extracted to: ${wslDestPath}`)
    return { success: true, extractedTo: wslDestPath }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Extract failed'
    console.error('[Borg] Extract error:', message)
    return { success: false, error: message }
  }
}

// Build borg command for extract (needs to be in the destination directory)
function buildBorgCommandForExtract(extractCmd: string): string {
  // SSH options to keep connection alive and prevent timeout
  const sshOptions = [
    '-o StrictHostKeyChecking=no',
    '-o ServerAliveInterval=30',
    '-o ServerAliveCountMax=10',
    '-o TCPKeepAlive=yes',
    '-o ConnectionAttempts=3',
    `-p ${BORG_CONFIG.port}`
  ].join(' ')

  const envVars = [
    `BORG_PASSPHRASE='${BORG_CONFIG.passphrase}'`,
    `BORG_RSH="sshpass -p '${BORG_CONFIG.password}' ssh ${sshOptions}"`,
    `BORG_UNKNOWN_UNENCRYPTED_REPO_ACCESS_IS_OK=yes`,
    `BORG_RELOCATED_REPO_ACCESS_IS_OK=yes`
  ].join(' ')

  // Replace 'borg extract' with env vars + borg extract
  return extractCmd.replace('borg extract', `${envVars} borg extract`)
}

// Get archive info with detailed stats
export async function getArchiveInfo(archiveName: string): Promise<{
  success: boolean
  info?: {
    name: string
    start: string
    end: string
    duration: number
    stats: {
      originalSize: number
      compressedSize: number
      deduplicatedSize: number
      nfiles: number
    }
  }
  error?: string
}> {
  try {
    const repoUrl = getRepoUrl()
    const { stdout } = await runBorgCommand(
      `info --json ${repoUrl}::${archiveName}`,
      60000
    )

    const data = JSON.parse(stdout)
    const archive = data.archives?.[0]

    if (!archive) {
      return { success: false, error: 'Archive not found' }
    }

    return {
      success: true,
      info: {
        name: archive.name,
        start: archive.start,
        end: archive.end,
        duration: archive.duration || 0,
        stats: {
          originalSize: archive.stats?.original_size || 0,
          compressedSize: archive.stats?.compressed_size || 0,
          deduplicatedSize: archive.stats?.deduplicated_size || 0,
          nfiles: archive.stats?.nfiles || 0
        }
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Get archive info failed'
    return { success: false, error: message }
  }
}
