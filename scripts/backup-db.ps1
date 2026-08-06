$ErrorActionPreference = "Stop"

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$backupDirectory = Join-Path $repositoryRoot "backups"

. (Join-Path $PSScriptRoot "postgresql-common.ps1")

Assert-PostgreSqlCommand "pg_dump"
Assert-PostgreSqlCommand "pg_restore"

$database = Get-DatabaseConfig -RepositoryRoot $repositoryRoot
$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$backupFile = Join-Path $backupDirectory "$($database.Name)_$timestamp.dump"

New-Item -ItemType Directory -Force -Path $backupDirectory | Out-Null

Write-Host "Backing up database '$($database.Name)'..."

$previousPassword = Set-PostgreSqlPassword -Password $database.Password

try {
  & pg_dump `
    "--host=$($database.Host)" `
    "--port=$($database.Port)" `
    "--username=$($database.User)" `
    "--dbname=$($database.Name)" `
    "--format=custom" `
    "--no-owner" `
    "--no-privileges" `
    "--file=$backupFile"

  if ($LASTEXITCODE -ne 0) {
    if (Test-Path -LiteralPath $backupFile -PathType Leaf) {
      Remove-Item -LiteralPath $backupFile
    }

    throw "Database backup failed."
  }

  & pg_restore --list $backupFile *> $null

  if ($LASTEXITCODE -ne 0) {
    throw "The backup file was created but could not be validated."
  }
} finally {
  Restore-PostgreSqlPassword -PreviousPassword $previousPassword
}

$createdBackup = Get-Item -LiteralPath $backupFile
$sizeInMb = [Math]::Round($createdBackup.Length / 1MB, 2)

Write-Host ""
Write-Host "Backup complete."
Write-Host "File: $($createdBackup.FullName)"
Write-Host "Size: $sizeInMb MB"
