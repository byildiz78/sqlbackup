import { NextResponse } from 'next/server'
import { getSyncStatus } from '@/lib/borg-backup'

// GET: Get current sync status
export async function GET() {
  try {
    const status = getSyncStatus()

    return NextResponse.json({
      success: true,
      ...status
    })
  } catch (error) {
    console.error('Failed to get sync status:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to get sync status' },
      { status: 500 }
    )
  }
}
