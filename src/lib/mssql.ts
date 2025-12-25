import sql from "mssql"
import { decrypt } from "./crypto"

export interface SqlServerConfig {
  host: string
  port: number
  username: string
  password: string
  database?: string
}

export interface DatabaseInfo {
  name: string
  sizeMb: number
  state: string
  recoveryModel: string
  lastFullBackup: Date | null
  lastDiffBackup: Date | null
  lastLogBackup: Date | null
}

export async function createConnection(config: SqlServerConfig): Promise<sql.ConnectionPool> {
  const pool = new sql.ConnectionPool({
    server: config.host,
    port: config.port,
    user: config.username,
    password: config.password,
    database: config.database || "master",
    options: {
      encrypt: false,
      trustServerCertificate: true,
    },
    connectionTimeout: 30000,
    requestTimeout: 7200000, // 2 hours for large backup/maintenance operations
  })

  await pool.connect()
  return pool
}

export async function createConnectionFromServer(server: {
  host: string
  port: number
  username: string
  passwordEncrypted: string
}, database?: string): Promise<sql.ConnectionPool> {
  const password = decrypt(server.passwordEncrypted)
  return createConnection({
    host: server.host,
    port: server.port,
    username: server.username,
    password,
    database
  })
}

export async function testConnection(config: SqlServerConfig): Promise<{ success: boolean; message: string; version?: string }> {
  try {
    const pool = await createConnection(config)
    const result = await pool.request().query("SELECT @@VERSION as version")
    await pool.close()
    return {
      success: true,
      message: "Connection successful",
      version: result.recordset[0]?.version
    }
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Connection failed"
    }
  }
}

export async function getDefaultBackupPath(pool: sql.ConnectionPool): Promise<string> {
  const result = await pool.request().query(`
    SELECT SERVERPROPERTY('InstanceDefaultBackupPath') as backupPath
  `)
  return result.recordset[0]?.backupPath || 'C:\\backup'
}

export async function getSqlServerEdition(pool: sql.ConnectionPool): Promise<{
  edition: string
  supportsCompression: boolean
}> {
  const result = await pool.request().query(`
    SELECT
      SERVERPROPERTY('Edition') as edition,
      SERVERPROPERTY('EngineEdition') as engineEdition
  `)
  const edition = result.recordset[0]?.edition || 'Unknown'
  const engineEdition = result.recordset[0]?.engineEdition || 0

  // Compression is supported in:
  // - Enterprise (engineEdition = 3)
  // - Standard (engineEdition = 2) - SQL 2016 SP1+
  // - Developer (engineEdition = 3)
  // NOT supported in Express (engineEdition = 4)
  const supportsCompression = engineEdition !== 4 && !edition.toLowerCase().includes('express')

  return { edition, supportsCompression }
}

export async function getDatabases(pool: sql.ConnectionPool): Promise<DatabaseInfo[]> {
  const result = await pool.request().query(`
    SELECT
      d.name,
      CAST(SUM(mf.size) * 8.0 / 1024 AS DECIMAL(18,2)) AS sizeMb,
      d.state_desc as state,
      d.recovery_model_desc as recoveryModel,
      (SELECT MAX(backup_finish_date) FROM msdb.dbo.backupset WHERE database_name = d.name AND type = 'D') as lastFullBackup,
      (SELECT MAX(backup_finish_date) FROM msdb.dbo.backupset WHERE database_name = d.name AND type = 'I') as lastDiffBackup,
      (SELECT MAX(backup_finish_date) FROM msdb.dbo.backupset WHERE database_name = d.name AND type = 'L') as lastLogBackup
    FROM sys.databases d
    LEFT JOIN sys.master_files mf ON d.database_id = mf.database_id
    WHERE d.database_id > 4  -- Exclude system databases
      AND d.state = 0  -- Only online databases
    GROUP BY d.name, d.state_desc, d.recovery_model_desc
    ORDER BY d.name
  `)

  return result.recordset.map(row => ({
    name: row.name,
    sizeMb: parseFloat(row.sizeMb) || 0,
    state: row.state,
    recoveryModel: row.recoveryModel,
    lastFullBackup: row.lastFullBackup,
    lastDiffBackup: row.lastDiffBackup,
    lastLogBackup: row.lastLogBackup
  }))
}

export async function executeBackup(
  pool: sql.ConnectionPool,
  databaseName: string,
  backupType: "FULL" | "DIFF" | "LOG",
  backupPath: string,
  options: { compress?: boolean; checksum?: boolean } = {}
): Promise<{ success: boolean; message: string; filePath?: string; sizeMb?: number }> {
  const now = new Date()
  const dateFolder = now.toISOString().split('T')[0] // 2025-12-12
  const dateStamp = dateFolder.replace(/-/g, '') // 20251212
  const timeStamp = now.toTimeString().split(' ')[0].replace(/:/g, '') // 143000
  const fileName = `${databaseName}_${backupType}_${dateStamp}_${timeStamp}.bak`

  // Detect platform from path format (Linux paths start with /)
  const isLinux = backupPath.startsWith("/")
  const sep = isLinux ? "/" : "\\"

  // Normalize path separators based on platform
  const normalizedPath = isLinux
    ? backupPath.replace(/\\/g, "/")  // Linux: use forward slash
    : backupPath.replace(/\//g, "\\") // Windows: use backslash

  // Structure: BackupPath/FULL/2025-12-12/dbname_FULL_20251212_143000.bak
  const backupFolder = `${normalizedPath}${sep}${backupType}${sep}${dateFolder}`
  const fullPath = `${backupFolder}${sep}${fileName}`

  // Create folder structure
  try {
    await pool.request().query(`EXEC xp_create_subdir '${backupFolder}'`)
  } catch {
    // Folder might already exist, continue
  }

  console.log(`[Backup] Executing backup to: ${fullPath}`)

  let backupCommand = ""

  switch (backupType) {
    case "FULL":
      backupCommand = `BACKUP DATABASE [${databaseName}] TO DISK = N'${fullPath}'`
      break
    case "DIFF":
      backupCommand = `BACKUP DATABASE [${databaseName}] TO DISK = N'${fullPath}' WITH DIFFERENTIAL`
      break
    case "LOG":
      backupCommand = `BACKUP LOG [${databaseName}] TO DISK = N'${fullPath}'`
      break
  }

  const withOptions: string[] = []
  // Note: COMPRESSION may not be available in SQL Server Express
  if (options.compress) withOptions.push("COMPRESSION")
  if (options.checksum) withOptions.push("CHECKSUM")
  withOptions.push("INIT")

  if (backupType === "DIFF") {
    backupCommand += withOptions.length > 0 ? `, ${withOptions.join(", ")}` : ""
  } else {
    backupCommand += ` WITH ${withOptions.join(", ")}`
  }

  try {
    console.log(`[Backup] Command: ${backupCommand}`)
    await pool.request().query(backupCommand)

    // Get backup size from msdb
    let sizeMb: number | undefined
    try {
      const sizeResult = await pool.request().query(`
        SELECT TOP 1
          CAST(backup_size / 1024.0 / 1024.0 AS DECIMAL(18,2)) as sizeMb
        FROM msdb.dbo.backupset
        WHERE database_name = '${databaseName}'
        ORDER BY backup_finish_date DESC
      `)
      sizeMb = sizeResult.recordset[0]?.sizeMb ? parseFloat(sizeResult.recordset[0].sizeMb) : undefined
    } catch {
      // Couldn't get size, continue without it
    }

    return { success: true, message: "Backup completed successfully", filePath: fullPath, sizeMb }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Backup failed"
    console.error(`[Backup] Failed: ${errorMsg}`)
    return {
      success: false,
      message: errorMsg
    }
  }
}

export async function checkOlaHallengrenInstalled(pool: sql.ConnectionPool): Promise<boolean> {
  try {
    const result = await pool.request().query(`
      SELECT COUNT(*) as count
      FROM master.sys.procedures
      WHERE name = 'DatabaseBackup'
    `)
    return result.recordset[0].count > 0
  } catch {
    return false
  }
}

export async function executeOlaBackup(
  pool: sql.ConnectionPool,
  databases: string,
  backupType: "FULL" | "DIFF" | "LOG",
  directory: string,
  options: { compress?: boolean; checksum?: boolean; logToTable?: boolean } = {}
): Promise<{ success: boolean; message: string }> {
  try {
    let command = `
      EXECUTE dbo.DatabaseBackup
        @Databases = '${databases}',
        @Directory = '${directory}',
        @BackupType = '${backupType}'`

    if (options.compress) command += `,\n        @Compress = 'Y'`
    if (options.checksum) command += `,\n        @CheckSum = 'Y'`
    if (options.logToTable) command += `,\n        @LogToTable = 'Y'`

    await pool.request().query(command)
    return { success: true, message: "Ola Hallengren backup completed" }
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Backup failed"
    }
  }
}

export async function executeIndexOptimize(
  pool: sql.ConnectionPool,
  databases: string,
  options: {
    fragmentationLevel1?: number
    fragmentationLevel2?: number
    logToTable?: boolean
  } = {}
): Promise<{ success: boolean; message: string }> {
  try {
    const fragLevel1 = options.fragmentationLevel1 || 5
    const fragLevel2 = options.fragmentationLevel2 || 30

    let command = `
      EXECUTE dbo.IndexOptimize
        @Databases = '${databases}',
        @FragmentationLow = NULL,
        @FragmentationMedium = 'INDEX_REORGANIZE',
        @FragmentationHigh = 'INDEX_REBUILD_ONLINE,INDEX_REBUILD_OFFLINE',
        @FragmentationLevel1 = ${fragLevel1},
        @FragmentationLevel2 = ${fragLevel2}`

    if (options.logToTable) command += `,\n        @LogToTable = 'Y'`

    await pool.request().query(command)
    return { success: true, message: "Index optimization completed" }
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Index optimization failed"
    }
  }
}

export async function executeIntegrityCheck(
  pool: sql.ConnectionPool,
  databases: string,
  options: { logToTable?: boolean } = {}
): Promise<{ success: boolean; message: string }> {
  try {
    let command = `
      EXECUTE dbo.DatabaseIntegrityCheck
        @Databases = '${databases}'`

    if (options.logToTable) command += `,\n        @LogToTable = 'Y'`

    await pool.request().query(command)
    return { success: true, message: "Integrity check completed" }
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Integrity check failed"
    }
  }
}

export async function getOlaHallengrenVersion(pool: sql.ConnectionPool): Promise<string | null> {
  try {
    const result = await pool.request().query(`
      SELECT TOP 1
        CASE
          WHEN OBJECT_ID('master.dbo.DatabaseBackup') IS NOT NULL
          THEN (
            SELECT TOP 1 CAST(Value AS NVARCHAR(100))
            FROM master.sys.extended_properties
            WHERE major_id = OBJECT_ID('master.dbo.DatabaseBackup')
              AND name = 'Version'
          )
          ELSE NULL
        END as version
    `)
    return result.recordset[0]?.version || null
  } catch {
    return null
  }
}

export async function installOlaHallengren(
  pool: sql.ConnectionPool
): Promise<{ success: boolean; message: string; details?: string }> {
  try {
    // Ola Hallengren MaintenanceSolution - Core stored procedures
    // This is a minimal embedded version for backup, index optimization, and integrity check

    const installScript = `
-- Ola Hallengren MaintenanceSolution Installation
-- Source: https://ola.hallengren.com

-- Create CommandLog table if not exists
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[CommandLog]') AND type in (N'U'))
BEGIN
CREATE TABLE [dbo].[CommandLog](
  [ID] [int] IDENTITY(1,1) NOT NULL,
  [DatabaseName] [sysname] NULL,
  [SchemaName] [sysname] NULL,
  [ObjectName] [sysname] NULL,
  [ObjectType] [char](2) NULL,
  [IndexName] [sysname] NULL,
  [IndexType] [tinyint] NULL,
  [StatisticsName] [sysname] NULL,
  [PartitionNumber] [int] NULL,
  [ExtendedInfo] [xml] NULL,
  [Command] [nvarchar](max) NOT NULL,
  [CommandType] [nvarchar](60) NOT NULL,
  [StartTime] [datetime2](7) NOT NULL,
  [EndTime] [datetime2](7) NULL,
  [ErrorNumber] [int] NULL,
  [ErrorMessage] [nvarchar](max) NULL,
 CONSTRAINT [PK_CommandLog] PRIMARY KEY CLUSTERED ([ID] ASC)
)
END
GO

-- Create CommandExecute stored procedure
IF OBJECT_ID('dbo.CommandExecute') IS NOT NULL DROP PROCEDURE dbo.CommandExecute
GO
CREATE PROCEDURE [dbo].[CommandExecute]
  @Command nvarchar(max),
  @CommandType nvarchar(60),
  @Mode int,
  @DatabaseName sysname = NULL,
  @SchemaName sysname = NULL,
  @ObjectName sysname = NULL,
  @ObjectType char(2) = NULL,
  @IndexName sysname = NULL,
  @IndexType tinyint = NULL,
  @StatisticsName sysname = NULL,
  @PartitionNumber int = NULL,
  @ExtendedInfo xml = NULL,
  @LogToTable nvarchar(max) = 'N',
  @Execute nvarchar(max) = 'Y'
AS
BEGIN
  SET NOCOUNT ON
  DECLARE @StartTime datetime2 = SYSDATETIME()
  DECLARE @EndTime datetime2
  DECLARE @ErrorNumber int = 0
  DECLARE @ErrorMessage nvarchar(max) = NULL
  DECLARE @ID int

  IF @LogToTable = 'Y'
  BEGIN
    INSERT INTO dbo.CommandLog (DatabaseName, SchemaName, ObjectName, ObjectType, IndexName, IndexType, StatisticsName, PartitionNumber, ExtendedInfo, Command, CommandType, StartTime)
    VALUES (@DatabaseName, @SchemaName, @ObjectName, @ObjectType, @IndexName, @IndexType, @StatisticsName, @PartitionNumber, @ExtendedInfo, @Command, @CommandType, @StartTime)
    SET @ID = SCOPE_IDENTITY()
  END

  IF @Execute = 'Y'
  BEGIN
    BEGIN TRY
      EXECUTE sp_executesql @Command
    END TRY
    BEGIN CATCH
      SET @ErrorNumber = ERROR_NUMBER()
      SET @ErrorMessage = ERROR_MESSAGE()
    END CATCH
  END

  SET @EndTime = SYSDATETIME()

  IF @LogToTable = 'Y'
  BEGIN
    UPDATE dbo.CommandLog
    SET EndTime = @EndTime, ErrorNumber = @ErrorNumber, ErrorMessage = @ErrorMessage
    WHERE ID = @ID
  END

  IF @ErrorNumber <> 0
  BEGIN
    RAISERROR(@ErrorMessage, 16, 1)
  END
END
GO

-- Extended property for version tracking
IF NOT EXISTS (SELECT * FROM sys.extended_properties WHERE class = 0 AND name = 'OlaHallengrenVersion')
  EXEC sp_addextendedproperty @name = 'OlaHallengrenVersion', @value = '2024-01-14 (Embedded)'
ELSE
  EXEC sp_updateextendedproperty @name = 'OlaHallengrenVersion', @value = '2024-01-14 (Embedded)'
GO

-- DatabaseBackup stored procedure
IF OBJECT_ID('dbo.DatabaseBackup') IS NOT NULL DROP PROCEDURE dbo.DatabaseBackup
GO
CREATE PROCEDURE [dbo].[DatabaseBackup]
  @Databases nvarchar(max) = NULL,
  @Directory nvarchar(max) = NULL,
  @BackupType nvarchar(max) = 'FULL',
  @Compress nvarchar(max) = 'N',
  @CheckSum nvarchar(max) = 'N',
  @LogToTable nvarchar(max) = 'N',
  @Execute nvarchar(max) = 'Y'
AS
BEGIN
  SET NOCOUNT ON

  DECLARE @DatabaseName sysname
  DECLARE @CurrentDate nvarchar(50) = CONVERT(nvarchar(50), GETDATE(), 112) + '_' + REPLACE(CONVERT(nvarchar(50), GETDATE(), 108), ':', '')
  DECLARE @BackupPath nvarchar(max)
  DECLARE @Command nvarchar(max)
  DECLARE @BackupTypeCode char(1)

  SET @BackupTypeCode = CASE @BackupType WHEN 'FULL' THEN 'D' WHEN 'DIFF' THEN 'I' WHEN 'LOG' THEN 'L' ELSE 'D' END

  DECLARE db_cursor CURSOR FOR
  SELECT name FROM sys.databases
  WHERE state = 0
    AND name NOT IN ('tempdb')
    AND (@Databases = 'ALL_DATABASES'
      OR @Databases = 'USER_DATABASES' AND database_id > 4
      OR @Databases = 'SYSTEM_DATABASES' AND database_id <= 4
      OR name IN (SELECT value FROM STRING_SPLIT(@Databases, ',')))
  ORDER BY name

  OPEN db_cursor
  FETCH NEXT FROM db_cursor INTO @DatabaseName

  WHILE @@FETCH_STATUS = 0
  BEGIN
    SET @BackupPath = @Directory + '\\' + @DatabaseName + '\\' + @BackupType + '\\' + @DatabaseName + '_' + @BackupType + '_' + @CurrentDate + '.bak'

    -- Create directory structure
    DECLARE @DirCmd nvarchar(max) = 'EXEC xp_create_subdir ''' + @Directory + '\\' + @DatabaseName + '\\' + @BackupType + ''''
    BEGIN TRY
      EXEC sp_executesql @DirCmd
    END TRY
    BEGIN CATCH
    END CATCH

    SET @Command = 'BACKUP ' + CASE WHEN @BackupTypeCode = 'L' THEN 'LOG' ELSE 'DATABASE' END + ' [' + @DatabaseName + '] TO DISK = ''' + @BackupPath + ''' WITH '

    IF @BackupTypeCode = 'I' SET @Command = @Command + 'DIFFERENTIAL, '
    IF @Compress = 'Y' SET @Command = @Command + 'COMPRESSION, '
    IF @CheckSum = 'Y' SET @Command = @Command + 'CHECKSUM, '

    SET @Command = @Command + 'INIT, FORMAT'

    IF @Execute = 'Y'
    BEGIN
      EXEC dbo.CommandExecute @Command = @Command, @CommandType = 'BACKUP_DATABASE', @Mode = 1, @DatabaseName = @DatabaseName, @LogToTable = @LogToTable, @Execute = @Execute
    END

    FETCH NEXT FROM db_cursor INTO @DatabaseName
  END

  CLOSE db_cursor
  DEALLOCATE db_cursor
END
GO

-- Extended property for DatabaseBackup version
IF NOT EXISTS (SELECT * FROM sys.extended_properties WHERE major_id = OBJECT_ID('dbo.DatabaseBackup') AND name = 'Version')
  EXEC sp_addextendedproperty @name = 'Version', @value = '2024-01-14', @level0type = 'SCHEMA', @level0name = 'dbo', @level1type = 'PROCEDURE', @level1name = 'DatabaseBackup'
GO

-- IndexOptimize stored procedure
IF OBJECT_ID('dbo.IndexOptimize') IS NOT NULL DROP PROCEDURE dbo.IndexOptimize
GO
CREATE PROCEDURE [dbo].[IndexOptimize]
  @Databases nvarchar(max) = NULL,
  @FragmentationLow nvarchar(max) = NULL,
  @FragmentationMedium nvarchar(max) = 'INDEX_REORGANIZE',
  @FragmentationHigh nvarchar(max) = 'INDEX_REBUILD_ONLINE,INDEX_REBUILD_OFFLINE',
  @FragmentationLevel1 int = 5,
  @FragmentationLevel2 int = 30,
  @LogToTable nvarchar(max) = 'N',
  @Execute nvarchar(max) = 'Y'
AS
BEGIN
  SET NOCOUNT ON

  DECLARE @DatabaseName sysname
  DECLARE @SchemaName sysname
  DECLARE @ObjectName sysname
  DECLARE @IndexName sysname
  DECLARE @Fragmentation float
  DECLARE @Command nvarchar(max)
  DECLARE @Action nvarchar(max)

  DECLARE db_cursor CURSOR FOR
  SELECT name FROM sys.databases
  WHERE state = 0
    AND name NOT IN ('tempdb')
    AND (@Databases = 'ALL_DATABASES'
      OR @Databases = 'USER_DATABASES' AND database_id > 4
      OR name IN (SELECT value FROM STRING_SPLIT(@Databases, ',')))
  ORDER BY name

  OPEN db_cursor
  FETCH NEXT FROM db_cursor INTO @DatabaseName

  WHILE @@FETCH_STATUS = 0
  BEGIN
    DECLARE @SQL nvarchar(max) = '
    USE [' + @DatabaseName + '];
    SELECT
      s.name as SchemaName,
      o.name as ObjectName,
      i.name as IndexName,
      ps.avg_fragmentation_in_percent as Fragmentation
    FROM sys.dm_db_index_physical_stats(DB_ID(), NULL, NULL, NULL, ''LIMITED'') ps
    INNER JOIN sys.indexes i ON ps.object_id = i.object_id AND ps.index_id = i.index_id
    INNER JOIN sys.objects o ON i.object_id = o.object_id
    INNER JOIN sys.schemas s ON o.schema_id = s.schema_id
    WHERE ps.avg_fragmentation_in_percent > ' + CAST(@FragmentationLevel1 as nvarchar(10)) + '
      AND ps.page_count > 1000
      AND i.name IS NOT NULL
      AND o.type = ''U''
    ORDER BY ps.avg_fragmentation_in_percent DESC'

    CREATE TABLE #IndexesToOptimize (SchemaName sysname, ObjectName sysname, IndexName sysname, Fragmentation float)
    INSERT INTO #IndexesToOptimize EXEC sp_executesql @SQL

    DECLARE idx_cursor CURSOR FOR SELECT * FROM #IndexesToOptimize
    OPEN idx_cursor
    FETCH NEXT FROM idx_cursor INTO @SchemaName, @ObjectName, @IndexName, @Fragmentation

    WHILE @@FETCH_STATUS = 0
    BEGIN
      IF @Fragmentation >= @FragmentationLevel2
        SET @Action = 'REBUILD'
      ELSE
        SET @Action = 'REORGANIZE'

      SET @Command = 'USE [' + @DatabaseName + ']; ALTER INDEX [' + @IndexName + '] ON [' + @SchemaName + '].[' + @ObjectName + '] ' + @Action

      IF @Action = 'REBUILD' SET @Command = @Command + ' WITH (ONLINE = ON)'

      BEGIN TRY
        IF @Execute = 'Y'
          EXEC dbo.CommandExecute @Command = @Command, @CommandType = 'ALTER_INDEX', @Mode = 1, @DatabaseName = @DatabaseName, @SchemaName = @SchemaName, @ObjectName = @ObjectName, @IndexName = @IndexName, @LogToTable = @LogToTable, @Execute = @Execute
      END TRY
      BEGIN CATCH
        -- Try offline rebuild if online fails
        IF @Action = 'REBUILD'
        BEGIN
          SET @Command = 'USE [' + @DatabaseName + ']; ALTER INDEX [' + @IndexName + '] ON [' + @SchemaName + '].[' + @ObjectName + '] REBUILD'
          BEGIN TRY
            IF @Execute = 'Y'
              EXEC dbo.CommandExecute @Command = @Command, @CommandType = 'ALTER_INDEX', @Mode = 1, @DatabaseName = @DatabaseName, @SchemaName = @SchemaName, @ObjectName = @ObjectName, @IndexName = @IndexName, @LogToTable = @LogToTable, @Execute = @Execute
          END TRY
          BEGIN CATCH
          END CATCH
        END
      END CATCH

      FETCH NEXT FROM idx_cursor INTO @SchemaName, @ObjectName, @IndexName, @Fragmentation
    END

    CLOSE idx_cursor
    DEALLOCATE idx_cursor
    DROP TABLE #IndexesToOptimize

    FETCH NEXT FROM db_cursor INTO @DatabaseName
  END

  CLOSE db_cursor
  DEALLOCATE db_cursor
END
GO

-- DatabaseIntegrityCheck stored procedure
IF OBJECT_ID('dbo.DatabaseIntegrityCheck') IS NOT NULL DROP PROCEDURE dbo.DatabaseIntegrityCheck
GO
CREATE PROCEDURE [dbo].[DatabaseIntegrityCheck]
  @Databases nvarchar(max) = NULL,
  @LogToTable nvarchar(max) = 'N',
  @Execute nvarchar(max) = 'Y'
AS
BEGIN
  SET NOCOUNT ON

  DECLARE @DatabaseName sysname
  DECLARE @Command nvarchar(max)

  DECLARE db_cursor CURSOR FOR
  SELECT name FROM sys.databases
  WHERE state = 0
    AND name NOT IN ('tempdb')
    AND (@Databases = 'ALL_DATABASES'
      OR @Databases = 'USER_DATABASES' AND database_id > 4
      OR @Databases = 'SYSTEM_DATABASES' AND database_id <= 4
      OR name IN (SELECT value FROM STRING_SPLIT(@Databases, ',')))
  ORDER BY name

  OPEN db_cursor
  FETCH NEXT FROM db_cursor INTO @DatabaseName

  WHILE @@FETCH_STATUS = 0
  BEGIN
    SET @Command = 'DBCC CHECKDB([' + @DatabaseName + ']) WITH NO_INFOMSGS'

    IF @Execute = 'Y'
    BEGIN
      EXEC dbo.CommandExecute @Command = @Command, @CommandType = 'DBCC_CHECKDB', @Mode = 1, @DatabaseName = @DatabaseName, @LogToTable = @LogToTable, @Execute = @Execute
    END

    FETCH NEXT FROM db_cursor INTO @DatabaseName
  END

  CLOSE db_cursor
  DEALLOCATE db_cursor
END
GO

PRINT 'Ola Hallengren MaintenanceSolution installed successfully!'
`

    // Execute the script in batches (split by GO)
    const batches = installScript.split(/\nGO\n/i).filter(batch => batch.trim().length > 0)

    for (const batch of batches) {
      try {
        await pool.request().query(batch)
      } catch (batchError) {
        // Continue on non-critical errors
        const errorMsg = batchError instanceof Error ? batchError.message : String(batchError)
        if (!errorMsg.includes('already exists') && !errorMsg.includes('Cannot find')) {
          console.log('Batch warning:', errorMsg)
        }
      }
    }

    // Verify installation
    const isInstalled = await checkOlaHallengrenInstalled(pool)

    if (isInstalled) {
      return {
        success: true,
        message: "Ola Hallengren MaintenanceSolution installed successfully",
        details: "Installed procedures: DatabaseBackup, IndexOptimize, DatabaseIntegrityCheck, CommandExecute"
      }
    } else {
      return {
        success: false,
        message: "Installation completed but verification failed"
      }
    }
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Installation failed"
    }
  }
}
