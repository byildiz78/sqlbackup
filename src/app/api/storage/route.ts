import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"

export async function GET() {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const targets = await prisma.storageTarget.findMany({
    orderBy: { name: "asc" }
  })

  // Parse config and hide sensitive data
  const sanitized = targets.map((target) => {
    const config = JSON.parse(target.config)
    if (config.s3SecretKey) {
      config.s3SecretKey = "********"
    }
    return {
      ...target,
      config
    }
  })

  return NextResponse.json(sanitized)
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json()
  const { name, storageType, config, isDefault } = body

  if (!name || !storageType || !config) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
  }

  // If setting as default, unset other defaults
  if (isDefault) {
    await prisma.storageTarget.updateMany({
      where: { isDefault: true },
      data: { isDefault: false }
    })
  }

  const target = await prisma.storageTarget.create({
    data: {
      name,
      storageType,
      config: JSON.stringify(config),
      isDefault: isDefault || false
    }
  })

  return NextResponse.json(target)
}
