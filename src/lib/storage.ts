import { S3Client, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3"
import fs from "fs"
import path from "path"

export interface StorageConfig {
  type: "LOCAL" | "NFS" | "S3"
  localPath?: string
  s3Bucket?: string
  s3Region?: string
  s3AccessKey?: string
  s3SecretKey?: string
  s3Endpoint?: string // For MinIO
}

export interface StorageProvider {
  upload(filePath: string, destination: string): Promise<string>
  delete(filePath: string): Promise<void>
  list(prefix?: string): Promise<string[]>
  getSpaceInfo(): Promise<{ total: number; used: number; free: number } | null>
}

export class LocalStorageProvider implements StorageProvider {
  private basePath: string

  constructor(basePath: string) {
    this.basePath = basePath
    // Ensure directory exists
    if (!fs.existsSync(basePath)) {
      fs.mkdirSync(basePath, { recursive: true })
    }
  }

  async upload(sourcePath: string, destination: string): Promise<string> {
    const destPath = path.join(this.basePath, destination)
    const destDir = path.dirname(destPath)

    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true })
    }

    fs.copyFileSync(sourcePath, destPath)
    return destPath
  }

  async delete(filePath: string): Promise<void> {
    const fullPath = path.join(this.basePath, filePath)
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath)
    }
  }

  async list(prefix?: string): Promise<string[]> {
    const searchPath = prefix ? path.join(this.basePath, prefix) : this.basePath

    if (!fs.existsSync(searchPath)) {
      return []
    }

    const files: string[] = []

    function walkDir(dir: string) {
      const items = fs.readdirSync(dir)
      for (const item of items) {
        const fullPath = path.join(dir, item)
        const stat = fs.statSync(fullPath)
        if (stat.isDirectory()) {
          walkDir(fullPath)
        } else {
          files.push(fullPath.replace(searchPath + path.sep, ""))
        }
      }
    }

    walkDir(searchPath)
    return files
  }

  async getSpaceInfo(): Promise<{ total: number; used: number; free: number } | null> {
    try {
      // This is a simplified version - in production you'd use a proper disk space library
      const stats = fs.statfsSync(this.basePath)
      const blockSize = stats.bsize
      const total = stats.blocks * blockSize
      const free = stats.bfree * blockSize
      const used = total - free

      return {
        total: Math.round(total / (1024 * 1024 * 1024)), // GB
        used: Math.round(used / (1024 * 1024 * 1024)),
        free: Math.round(free / (1024 * 1024 * 1024))
      }
    } catch {
      return null
    }
  }
}

export class S3StorageProvider implements StorageProvider {
  private client: S3Client
  private bucket: string

  constructor(config: {
    bucket: string
    region?: string
    accessKey: string
    secretKey: string
    endpoint?: string
  }) {
    this.bucket = config.bucket
    this.client = new S3Client({
      region: config.region || "us-east-1",
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKey,
        secretAccessKey: config.secretKey
      },
      forcePathStyle: !!config.endpoint // For MinIO
    })
  }

  async upload(sourcePath: string, destination: string): Promise<string> {
    const fileContent = fs.readFileSync(sourcePath)

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: destination,
        Body: fileContent
      })
    )

    return `s3://${this.bucket}/${destination}`
  }

  async delete(filePath: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: filePath
      })
    )
  }

  async list(prefix?: string): Promise<string[]> {
    const response = await this.client.send(
      new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: prefix
      })
    )

    return response.Contents?.map((obj) => obj.Key || "") || []
  }

  async getSpaceInfo(): Promise<{ total: number; used: number; free: number } | null> {
    // S3 doesn't have a concept of total space
    return null
  }
}

export function createStorageProvider(config: StorageConfig): StorageProvider {
  switch (config.type) {
    case "LOCAL":
    case "NFS":
      if (!config.localPath) {
        throw new Error("localPath is required for LOCAL/NFS storage")
      }
      return new LocalStorageProvider(config.localPath)

    case "S3":
      if (!config.s3Bucket || !config.s3AccessKey || !config.s3SecretKey) {
        throw new Error("S3 configuration is incomplete")
      }
      return new S3StorageProvider({
        bucket: config.s3Bucket,
        region: config.s3Region,
        accessKey: config.s3AccessKey,
        secretKey: config.s3SecretKey,
        endpoint: config.s3Endpoint
      })

    default:
      throw new Error(`Unknown storage type: ${config.type}`)
  }
}
