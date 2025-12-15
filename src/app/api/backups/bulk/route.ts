import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { scheduleBackupJob } from "@/lib/scheduler"

interface BulkJobRequest {
  databaseIds: string[]
  backupType: "FULL" | "DIFF"
  scheduleType: "weekly" | "daily"
  startHour: number // 0-23
  windowHours: number // How many hours to spread jobs across
  weekDay?: number // 0-6 for weekly (0 = Sunday)
  storageTarget: string
  compression: boolean
  checksum: boolean
  retentionDays: number
}

function generateStaggeredCron(
  index: number,
  totalJobs: number,
  scheduleType: "weekly" | "daily",
  startHour: number,
  windowHours: number,
  weekDay?: number
): string {
  // Calculate how many minutes apart each job should be
  const totalMinutes = windowHours * 60
  const intervalMinutes = Math.floor(totalMinutes / totalJobs)

  // Calculate this job's offset in minutes from start
  const offsetMinutes = index * intervalMinutes

  // Calculate hour and minute
  const hour = startHour + Math.floor(offsetMinutes / 60)
  const minute = offsetMinutes % 60

  // Wrap hour if it exceeds 23
  const adjustedHour = hour % 24

  if (scheduleType === "weekly") {
    // Weekly: minute hour * * weekDay
    return `${minute} ${adjustedHour} * * ${weekDay ?? 6}` // Default Saturday
  } else {
    // Daily: minute hour * * *
    return `${minute} ${adjustedHour} * * *`
  }
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body: BulkJobRequest = await request.json()
  const {
    databaseIds,
    backupType,
    scheduleType,
    startHour,
    windowHours,
    weekDay,
    storageTarget,
    compression,
    checksum,
    retentionDays
  } = body

  if (!databaseIds || databaseIds.length === 0) {
    return NextResponse.json({ error: "No databases selected" }, { status: 400 })
  }

  // Validate databases exist
  const databases = await prisma.database.findMany({
    where: { id: { in: databaseIds } }
  })

  if (databases.length !== databaseIds.length) {
    return NextResponse.json({ error: "Some databases not found" }, { status: 400 })
  }

  const createdJobs: string[] = []
  const skippedJobs: string[] = []
  const errors: string[] = []

  for (let i = 0; i < databaseIds.length; i++) {
    const dbId = databaseIds[i]
    const db = databases.find(d => d.id === dbId)

    if (!db) continue

    // Check if job already exists for this database and backup type
    const existingJob = await prisma.backupJob.findFirst({
      where: {
        databaseId: dbId,
        backupType: backupType
      }
    })

    if (existingJob) {
      skippedJobs.push(db.name)
      continue
    }

    // Generate staggered cron expression
    const cronExpression = generateStaggeredCron(
      i,
      databaseIds.length,
      scheduleType,
      startHour,
      windowHours,
      weekDay
    )

    try {
      const job = await prisma.backupJob.create({
        data: {
          databaseId: dbId,
          backupType,
          scheduleCron: cronExpression,
          storageTarget: storageTarget || "default",
          compression,
          checksum,
          retentionDays,
          isEnabled: true
        }
      })

      // Schedule the job
      scheduleBackupJob(job.id, cronExpression)
      createdJobs.push(db.name)
    } catch (error) {
      errors.push(`${db.name}: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  return NextResponse.json({
    success: true,
    summary: {
      created: createdJobs.length,
      skipped: skippedJobs.length,
      errors: errors.length,
      total: databaseIds.length
    },
    details: {
      created: createdJobs,
      skipped: skippedJobs,
      errors
    },
    schedule: {
      type: scheduleType,
      startHour,
      windowHours,
      weekDay: scheduleType === "weekly" ? weekDay : undefined,
      intervalMinutes: Math.floor((windowHours * 60) / databaseIds.length)
    }
  })
}

// GET endpoint to preview staggered schedule
export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const searchParams = request.nextUrl.searchParams
  const count = parseInt(searchParams.get("count") || "10")
  const scheduleType = searchParams.get("scheduleType") as "weekly" | "daily" || "daily"
  const startHour = parseInt(searchParams.get("startHour") || "22")
  const windowHours = parseInt(searchParams.get("windowHours") || "8")
  const weekDay = parseInt(searchParams.get("weekDay") || "6")

  const preview = []
  for (let i = 0; i < Math.min(count, 20); i++) {
    const cron = generateStaggeredCron(i, count, scheduleType, startHour, windowHours, weekDay)
    preview.push({
      index: i + 1,
      cron,
      description: describeCron(cron)
    })
  }

  return NextResponse.json({
    preview,
    intervalMinutes: Math.floor((windowHours * 60) / count),
    totalJobs: count
  })
}

function describeCron(cron: string): string {
  const parts = cron.split(' ')
  const [minute, hour, , , dayOfWeek] = parts

  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

  if (dayOfWeek === '*') {
    return `Daily at ${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`
  } else {
    return `${days[parseInt(dayOfWeek)]} at ${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`
  }
}
