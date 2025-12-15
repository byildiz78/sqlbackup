import { NextResponse } from 'next/server'
import { initRepository, testConnection, checkBorgInstalled, checkSshpassInstalled } from '@/lib/borg-backup'

// POST: Initialize borg repository
export async function POST() {
  try {
    // Check prerequisites
    const borgInstalled = await checkBorgInstalled()
    if (!borgInstalled) {
      return NextResponse.json(
        { success: false, error: 'BorgBackup is not installed' },
        { status: 400 }
      )
    }

    const sshpassInstalled = await checkSshpassInstalled()
    if (!sshpassInstalled) {
      return NextResponse.json(
        { success: false, error: 'sshpass is not installed' },
        { status: 400 }
      )
    }

    // Test connection first
    const connectionTest = await testConnection()
    if (!connectionTest.success) {
      return NextResponse.json(
        { success: false, error: `Connection failed: ${connectionTest.error}` },
        { status: 400 }
      )
    }

    // Initialize repository
    const result = await initRepository()

    return NextResponse.json(result)
  } catch (error) {
    console.error('Borg init error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to initialize repository' },
      { status: 500 }
    )
  }
}
