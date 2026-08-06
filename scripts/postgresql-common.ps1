$ErrorActionPreference = "Stop"

function Get-DatabaseConfig {
  param(
    [Parameter(Mandatory = $true)]
    [string]$RepositoryRoot
  )

  $envFile = Join-Path $RepositoryRoot ".env"

  if (-not (Test-Path -LiteralPath $envFile -PathType Leaf)) {
    throw ".env was not found at $envFile"
  }

  $databaseUrlLine = Get-Content -LiteralPath $envFile |
    Where-Object { $_ -match "^\s*DATABASE_URL\s*=" } |
    Select-Object -First 1

  if (-not $databaseUrlLine) {
    throw "DATABASE_URL was not found in .env"
  }

  $databaseUrl = ($databaseUrlLine -split "=", 2)[1].Trim()
  $databaseUrl = $databaseUrl.Trim('"').Trim("'")
  $uri = [Uri]$databaseUrl

  if ($uri.Scheme -notin @("postgres", "postgresql")) {
    throw "DATABASE_URL is not a PostgreSQL URL"
  }

  $credentialSeparator = $uri.UserInfo.IndexOf(":")

  if ($credentialSeparator -lt 0) {
    $databaseUser = [Uri]::UnescapeDataString($uri.UserInfo)
    $databasePassword = ""
  } else {
    $databaseUser = [Uri]::UnescapeDataString(
      $uri.UserInfo.Substring(0, $credentialSeparator)
    )
    $databasePassword = [Uri]::UnescapeDataString(
      $uri.UserInfo.Substring($credentialSeparator + 1)
    )
  }

  $databasePort = if ($uri.Port -gt 0) { $uri.Port } else { 5432 }
  $databaseName = [Uri]::UnescapeDataString($uri.AbsolutePath.TrimStart("/"))

  if (-not $uri.Host -or -not $databaseUser -or -not $databaseName) {
    throw "DATABASE_URL is missing its host, user, or database name"
  }

  return [PSCustomObject]@{
    Host = $uri.Host
    Port = $databasePort
    User = $databaseUser
    Password = $databasePassword
    Name = $databaseName
  }
}

function Assert-PostgreSqlCommand {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Command
  )

  if (-not (Get-Command $Command -ErrorAction SilentlyContinue)) {
    throw "$Command was not found. Add the PostgreSQL bin directory to PATH."
  }
}

function Set-PostgreSqlPassword {
  param(
    [Parameter(Mandatory = $true)]
    [AllowEmptyString()]
    [string]$Password
  )

  $previousPassword = [Environment]::GetEnvironmentVariable(
    "PGPASSWORD",
    "Process"
  )

  [Environment]::SetEnvironmentVariable("PGPASSWORD", $Password, "Process")
  return $previousPassword
}

function Restore-PostgreSqlPassword {
  param(
    [AllowNull()]
    [string]$PreviousPassword
  )

  [Environment]::SetEnvironmentVariable(
    "PGPASSWORD",
    $PreviousPassword,
    "Process"
  )
}
