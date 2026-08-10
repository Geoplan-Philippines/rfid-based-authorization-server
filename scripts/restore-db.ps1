param(
  [Parameter(Position = 0)]
  [string]$BackupFile
)

$ErrorActionPreference = "Stop"

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$backupDirectory = Join-Path $repositoryRoot "backups"

. (Join-Path $PSScriptRoot "postgresql-common.ps1")

Assert-PostgreSqlCommand "pg_restore"
Assert-PostgreSqlCommand "dropdb"
Assert-PostgreSqlCommand "createdb"
Assert-PostgreSqlCommand "psql"

$database = Get-DatabaseConfig -RepositoryRoot $repositoryRoot

if ($database.Name -in @("postgres", "template0", "template1")) {
  throw "Refusing to replace PostgreSQL system database '$($database.Name)'."
}

if ($BackupFile) {
  if (-not [IO.Path]::IsPathRooted($BackupFile)) {
    $BackupFile = Join-Path $repositoryRoot $BackupFile
  }

  if (-not (Test-Path -LiteralPath $BackupFile -PathType Leaf)) {
    throw "Backup file not found: $BackupFile"
  }

  $selectedBackup = Get-Item -LiteralPath $BackupFile
} else {
  $selectedBackup = Get-ChildItem `
    -LiteralPath $backupDirectory `
    -Filter "*.dump" `
    -File `
    -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTimeUtc -Descending |
    Select-Object -First 1

  if (-not $selectedBackup) {
    throw "No .dump backup was found in $backupDirectory"
  }
}

$backupRoot = [IO.Path]::GetFullPath($backupDirectory).TrimEnd("\", "/")
$selectedPath = [IO.Path]::GetFullPath($selectedBackup.FullName)
$expectedPrefix = "$backupRoot$([IO.Path]::DirectorySeparatorChar)"

if (-not $selectedPath.StartsWith(
    $expectedPrefix,
    [StringComparison]::OrdinalIgnoreCase
  )) {
  throw "The backup file must be inside $backupDirectory"
}

Write-Host "Database: $($database.Name)"
Write-Host "Backup:  $selectedPath"
Write-Host ""
Write-Host "Stop the development server before continuing."
Write-Host "The current '$($database.Name)' database will be deleted."
Write-Host ""

$confirmation = Read-Host "Type RESTORE to continue"

if ($confirmation -ne "RESTORE") {
  Write-Host "Restore cancelled."
  exit 0
}

$previousPassword = Set-PostgreSqlPassword -Password $database.Password

try {
  & pg_restore --list $selectedPath *> $null

  if ($LASTEXITCODE -ne 0) {
    throw "The selected file is not a valid PostgreSQL custom-format backup."
  }

  Write-Host ""
  Write-Host "Deleting the current database..."

  & dropdb `
    "--host=$($database.Host)" `
    "--port=$($database.Port)" `
    "--username=$($database.User)" `
    "--if-exists" `
    "--force" `
    $database.Name

  if ($LASTEXITCODE -ne 0) {
    throw "Could not delete the current database. Stop all connected apps."
  }

  Write-Host "Creating an empty database..."

  & createdb `
    "--host=$($database.Host)" `
    "--port=$($database.Port)" `
    "--username=$($database.User)" `
    "--owner=$($database.User)" `
    "--template=template0" `
    $database.Name

  if ($LASTEXITCODE -ne 0) {
    throw "Could not create the empty database."
  }

  Write-Host "Enabling required extensions..."

  & psql `
    "--host=$($database.Host)" `
    "--port=$($database.Port)" `
    "--username=$($database.User)" `
    "--dbname=$($database.Name)" `
    "--command=CREATE EXTENSION IF NOT EXISTS vector;"

  if ($LASTEXITCODE -ne 0) {
    throw "Could not enable the vector extension on the fresh database."
  }

  Write-Host "Importing the backup..."

  & pg_restore `
    "--host=$($database.Host)" `
    "--port=$($database.Port)" `
    "--username=$($database.User)" `
    "--dbname=$($database.Name)" `
    "--no-owner" `
    "--no-privileges" `
    "--exit-on-error" `
    "--single-transaction" `
    $selectedPath

  if ($LASTEXITCODE -ne 0) {
    throw "Database restore failed."
  }
} finally {
  Restore-PostgreSqlPassword -PreviousPassword $previousPassword
}

Write-Host ""
Write-Host "Restore complete."
Write-Host "Database '$($database.Name)' now contains data from:"
Write-Host $selectedPath
