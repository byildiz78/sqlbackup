import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { scheduleBorgSync } from '@/lib/scheduler'

// All backup-related settings keys
const BACKUP_SETTINGS_KEYS = [
  'default_backup_path',
  'borg_sync_enabled',
  'borg_sync_mode',
  'borg_sync_time',
  'borg_sync_buffer_minutes',
  'borg_bandwidth_limit_enabled',
  'borg_bandwidth_peak_limit',
  'borg_bandwidth_offpeak_limit',
  'borg_bandwidth_peak_start',
  'borg_bandwidth_peak_end',
  'borg_bandwidth_weekend_unlimited'
]

// GET: Fetch backup settings
export async function GET() {
  try {
    const settings = await prisma.setting.findMany({
      where: {
        key: { in: BACKUP_SETTINGS_KEYS }
      }
    })

    const settingsMap: Record<string, string> = {}
    for (const s of settings) {
      settingsMap[s.key] = s.value
    }

    return NextResponse.json({
      // Basic settings
      backupPath: settingsMap['default_backup_path'] || '/var/opt/mssql/backup',
      borgSyncEnabled: settingsMap['borg_sync_enabled'] !== 'false',

      // Sync mode settings
      borgSyncMode: settingsMap['borg_sync_mode'] || 'after_backups',
      borgSyncTime: settingsMap['borg_sync_time'] || '06:00',
      borgSyncBufferMinutes: parseInt(settingsMap['borg_sync_buffer_minutes'] || '30', 10),

      // Bandwidth settings
      bandwidthLimitEnabled: settingsMap['borg_bandwidth_limit_enabled'] !== 'false',
      bandwidthPeakLimit: parseInt(settingsMap['borg_bandwidth_peak_limit'] || '5000', 10),
      bandwidthOffpeakLimit: parseInt(settingsMap['borg_bandwidth_offpeak_limit'] || '0', 10),
      bandwidthPeakStart: settingsMap['borg_bandwidth_peak_start'] || '08:00',
      bandwidthPeakEnd: settingsMap['borg_bandwidth_peak_end'] || '20:00',
      bandwidthWeekendUnlimited: settingsMap['borg_bandwidth_weekend_unlimited'] !== 'false'
    })
  } catch (error) {
    console.error('Failed to fetch backup settings:', error)
    return NextResponse.json({
      backupPath: '/var/opt/mssql/backup',
      borgSyncEnabled: true,
      borgSyncMode: 'after_backups',
      borgSyncTime: '06:00',
      borgSyncBufferMinutes: 30,
      bandwidthLimitEnabled: true,
      bandwidthPeakLimit: 5000,
      bandwidthOffpeakLimit: 0,
      bandwidthPeakStart: '08:00',
      bandwidthPeakEnd: '20:00',
      bandwidthWeekendUnlimited: true
    })
  }
}

// POST: Save backup settings
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const {
      backupPath,
      borgSyncEnabled,
      borgSyncMode,
      borgSyncTime,
      borgSyncBufferMinutes,
      bandwidthLimitEnabled,
      bandwidthPeakLimit,
      bandwidthOffpeakLimit,
      bandwidthPeakStart,
      bandwidthPeakEnd,
      bandwidthWeekendUnlimited
    } = body

    // Validate backup path
    if (!backupPath || typeof backupPath !== 'string') {
      return NextResponse.json(
        { error: 'Invalid backup path' },
        { status: 400 }
      )
    }

    // Validate sync mode
    const validModes = ['scheduled', 'after_backups', 'manual']
    const syncMode = validModes.includes(borgSyncMode) ? borgSyncMode : 'after_backups'

    // Save settings
    const settingsToSave = [
      // Basic settings
      { key: 'default_backup_path', value: backupPath },
      { key: 'borg_sync_enabled', value: String(borgSyncEnabled !== false) },

      // Sync mode settings
      { key: 'borg_sync_mode', value: syncMode },
      { key: 'borg_sync_time', value: borgSyncTime || '06:00' },
      { key: 'borg_sync_buffer_minutes', value: String(borgSyncBufferMinutes || 30) },

      // Bandwidth settings
      { key: 'borg_bandwidth_limit_enabled', value: String(bandwidthLimitEnabled !== false) },
      { key: 'borg_bandwidth_peak_limit', value: String(bandwidthPeakLimit || 5000) },
      { key: 'borg_bandwidth_offpeak_limit', value: String(bandwidthOffpeakLimit || 0) },
      { key: 'borg_bandwidth_peak_start', value: bandwidthPeakStart || '08:00' },
      { key: 'borg_bandwidth_peak_end', value: bandwidthPeakEnd || '20:00' },
      { key: 'borg_bandwidth_weekend_unlimited', value: String(bandwidthWeekendUnlimited !== false) }
    ]

    for (const setting of settingsToSave) {
      await prisma.setting.upsert({
        where: { key: setting.key },
        update: { value: setting.value },
        create: { key: setting.key, value: setting.value }
      })
    }

    // Reschedule borg sync with new settings
    await scheduleBorgSync()

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to save backup settings:', error)
    return NextResponse.json(
      { error: 'Failed to save settings' },
      { status: 500 }
    )
  }
}
