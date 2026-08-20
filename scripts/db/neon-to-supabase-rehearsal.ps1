param(
  [string]$DumpPath = "output/db/neon-to-supabase-rehearsal.sql"
)

$ErrorActionPreference = "Stop"

function Assert-RequiredEnv {
  param([string]$Name)

  if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($Name))) {
    throw "$Name is required."
  }
}

function Assert-ExpectedProviderUrl {
  param(
    [string]$Name,
    [string]$ConnectionString,
    [string]$Provider
  )

  if ($env:ALLOW_LOCAL_DB_REHEARSAL -eq "1") {
    return
  }

  $uri = [System.Uri]::new($ConnectionString)
  $dbHostName = $uri.Host.ToLowerInvariant()
  $isExpected = if ($Provider -eq "neon") {
    $dbHostName.EndsWith(".neon.tech")
  } elseif ($Provider -eq "supabase") {
    $dbHostName.EndsWith(".supabase.co") -or
    $dbHostName.EndsWith(".supabase.com")
  } else {
    $false
  }

  if (-not $isExpected) {
    throw "$Name must point at $Provider. Set ALLOW_LOCAL_DB_REHEARSAL=1 only for disposable local tests."
  }
}

function ConvertTo-PgConnectionParts {
  param([string]$ConnectionString)

  $uri = [System.Uri]::new($ConnectionString)
  $userInfo = $uri.UserInfo.Split(":", 2)
  $database = $uri.AbsolutePath.TrimStart("/")
  if ([string]::IsNullOrWhiteSpace($database)) {
    throw "Postgres connection string is missing a database name."
  }

  $builder = [System.UriBuilder]::new($uri)
  $builder.UserName = [System.Uri]::EscapeDataString([System.Uri]::UnescapeDataString($userInfo[0]))
  $builder.Password = ""

  [pscustomobject]@{
    Host = $uri.Host
    Port = if ($uri.Port -gt 0) { [string]$uri.Port } else { "5432" }
    User = [System.Uri]::UnescapeDataString($userInfo[0])
    Password = if ($userInfo.Length -gt 1) {
      [System.Uri]::UnescapeDataString($userInfo[1])
    } else {
      ""
    }
    Database = $database
    PasswordlessUri = $builder.Uri.AbsoluteUri
  }
}

function ConvertTo-PgPassField {
  param([string]$Value)

  return $Value.Replace("\", "\\").Replace(":", "\:")
}

function Test-IsWindows {
  if ($PSVersionTable.ContainsKey("Platform")) {
    return $PSVersionTable.Platform -eq "Win32NT"
  }

  return $env:OS -eq "Windows_NT"
}

function New-PgPassFile {
  param(
    [object]$Source,
    [object]$Target
  )

  $pgpassPath = Join-Path ([System.IO.Path]::GetTempPath()) "grantpipe-pgpass-$([System.Guid]::NewGuid()).conf"
  $lines = @(
    "$(ConvertTo-PgPassField $Source.Host):$(ConvertTo-PgPassField $Source.Port):$(ConvertTo-PgPassField $Source.Database):$(ConvertTo-PgPassField $Source.User):$(ConvertTo-PgPassField $Source.Password)",
    "$(ConvertTo-PgPassField $Target.Host):$(ConvertTo-PgPassField $Target.Port):$(ConvertTo-PgPassField $Target.Database):$(ConvertTo-PgPassField $Target.User):$(ConvertTo-PgPassField $Target.Password)"
  )
  [System.IO.File]::WriteAllLines(
    $pgpassPath,
    $lines,
    [System.Text.UTF8Encoding]::new($false)
  )

  if (Test-IsWindows) {
    icacls.exe $pgpassPath /inheritance:r /grant:r "$($env:USERNAME):F" | Out-Null
  } else {
    chmod 600 $pgpassPath
  }

  return $pgpassPath
}

function Assert-NativeSuccess {
  param([string]$Name)

  if ($LASTEXITCODE -ne 0) {
    throw "$Name failed with exit code $LASTEXITCODE."
  }
}

function Assert-CommandAvailable {
  param([string]$Name)

  if ($null -eq (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "$Name is required. Install it on the host or set PG_TOOLS_DOCKER_CONTAINER to a container that has pg_dump and psql."
  }
}

function Invoke-HostPgDump {
  param(
    [object]$Source,
    [string]$ResolvedDumpPath
  )

  pg_dump `
    "--dbname=$($Source.PasswordlessUri)" `
    "--format=plain" `
    "--no-owner" `
    "--no-privileges" `
    "--no-password" `
    "--file=$ResolvedDumpPath"
  Assert-NativeSuccess "pg_dump"
}

function Invoke-HostPsqlRestore {
  param(
    [object]$Target,
    [string]$ResolvedDumpPath
  )

  psql `
    "--dbname=$($Target.PasswordlessUri)" `
    "--set=ON_ERROR_STOP=1" `
    "--single-transaction" `
    "--no-password" `
    "--file=$ResolvedDumpPath"
  Assert-NativeSuccess "psql"
}

function Invoke-DockerCommand {
  param(
    [string]$Name,
    [string[]]$Arguments
  )

  docker @Arguments
  Assert-NativeSuccess $Name
}

function Invoke-DockerCleanup {
  param(
    [string]$Container,
    [string[]]$Paths
  )

  if ([string]::IsNullOrWhiteSpace($Container) -or $Paths.Length -eq 0) {
    return
  }

  docker exec $Container rm -f -- @Paths | Out-Null
  if ($LASTEXITCODE -ne 0) {
    Write-Warning "Docker cleanup failed for container temp files. Remove them manually from $Container."
  }
}

function Invoke-DockerPgTools {
  param(
    [string]$Container,
    [object]$Source,
    [object]$Target,
    [string]$PgPassPath,
    [string]$ResolvedDumpPath
  )

  if ([string]::IsNullOrWhiteSpace($Container)) {
    throw "PG_TOOLS_DOCKER_CONTAINER cannot be blank when set."
  }
  Assert-CommandAvailable "docker"

  $token = [System.Guid]::NewGuid().ToString("N")
  $containerPgPassPath = "/tmp/grantpipe-pgpass-$token.conf"
  $containerDumpPath = "/tmp/grantpipe-dump-$token.sql"
  $pgpassCopyTarget = "$Container`:$containerPgPassPath"
  $dumpCopySource = "$Container`:$containerDumpPath"

  try {
    Invoke-DockerCommand "docker cp pgpass" @(
      "cp",
      $PgPassPath,
      $pgpassCopyTarget
    )
    Invoke-DockerCommand "docker chmod pgpass" @(
      "exec",
      $Container,
      "chmod",
      "600",
      $containerPgPassPath
    )

    Write-Host "Dumping Neon source to $ResolvedDumpPath using Docker container $Container"
    Invoke-DockerCommand "docker pg_dump" @(
      "exec",
      "-e",
      "PGPASSFILE=$containerPgPassPath",
      $Container,
      "pg_dump",
      "--dbname=$($Source.PasswordlessUri)",
      "--format=plain",
      "--no-owner",
      "--no-privileges",
      "--no-password",
      "--file=$containerDumpPath"
    )

    Invoke-DockerCommand "docker cp dump" @(
      "cp",
      $dumpCopySource,
      $ResolvedDumpPath
    )

    Write-Host "Restoring dump into Supabase migration database using Docker container $Container"
    Invoke-DockerCommand "docker psql" @(
      "exec",
      "-e",
      "PGPASSFILE=$containerPgPassPath",
      $Container,
      "psql",
      "--dbname=$($Target.PasswordlessUri)",
      "--set=ON_ERROR_STOP=1",
      "--single-transaction",
      "--no-password",
      "--file=$containerDumpPath"
    )
  } finally {
    Invoke-DockerCleanup -Container $Container -Paths @($containerPgPassPath, $containerDumpPath)
  }
}

Assert-RequiredEnv "OLD_DB_URL"
Assert-RequiredEnv "SUPABASE_MIGRATION_DB_URL"
Assert-ExpectedProviderUrl -Name "OLD_DB_URL" -ConnectionString $env:OLD_DB_URL -Provider "neon"
Assert-ExpectedProviderUrl -Name "SUPABASE_MIGRATION_DB_URL" -ConnectionString $env:SUPABASE_MIGRATION_DB_URL -Provider "supabase"

$source = ConvertTo-PgConnectionParts $env:OLD_DB_URL
$target = ConvertTo-PgConnectionParts $env:SUPABASE_MIGRATION_DB_URL
$resolvedDumpPath = Resolve-Path -LiteralPath $DumpPath -ErrorAction SilentlyContinue
if ($null -eq $resolvedDumpPath) {
  $resolvedDumpPath = [System.IO.Path]::GetFullPath((Join-Path (Get-Location) $DumpPath))
} else {
  $resolvedDumpPath = $resolvedDumpPath.Path
}

$outputDbDir = [System.IO.Path]::GetFullPath((Join-Path (Get-Location) "output/db"))
$dumpDir = [System.IO.Path]::GetFullPath((Split-Path -Parent $resolvedDumpPath))
$outputDbPrefix = $outputDbDir.TrimEnd(
  [System.IO.Path]::DirectorySeparatorChar,
  [System.IO.Path]::AltDirectorySeparatorChar
) + [System.IO.Path]::DirectorySeparatorChar
if (
  [string]::IsNullOrWhiteSpace($dumpDir) -or
  (
    -not $dumpDir.Equals($outputDbDir, [System.StringComparison]::OrdinalIgnoreCase) -and
    -not $dumpDir.StartsWith($outputDbPrefix, [System.StringComparison]::OrdinalIgnoreCase)
  )
) {
  throw "DumpPath must be under output/db."
}
New-Item -ItemType Directory -Force -Path $dumpDir | Out-Null

$pgpassPath = New-PgPassFile -Source $source -Target $target
$previousPgPassFile = $env:PGPASSFILE
$previousPgPassword = $env:PGPASSWORD

try {
  $env:PGPASSFILE = $pgpassPath
  Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue

  $pgToolsDockerContainer = $env:PG_TOOLS_DOCKER_CONTAINER
  if ([string]::IsNullOrWhiteSpace($pgToolsDockerContainer)) {
    Assert-CommandAvailable "pg_dump"
    Assert-CommandAvailable "psql"
    Write-Host "Dumping Neon source to $resolvedDumpPath"
    Invoke-HostPgDump -Source $source -ResolvedDumpPath $resolvedDumpPath

    Write-Host "Restoring dump into Supabase migration database"
    Invoke-HostPsqlRestore -Target $target -ResolvedDumpPath $resolvedDumpPath
  } else {
    Invoke-DockerPgTools `
      -Container $pgToolsDockerContainer `
      -Source $source `
      -Target $target `
      -PgPassPath $pgpassPath `
      -ResolvedDumpPath $resolvedDumpPath
  }

  Write-Host "Running provider migration audit"
  pnpm exec tsx scripts/db/provider-migration-audit.ts
  Assert-NativeSuccess "provider migration audit"

  Write-Host "Running Supabase invariant audit"
  pnpm exec tsx scripts/db/provider-migration-audit.ts --mode supabase-invariants
  Assert-NativeSuccess "Supabase invariant audit"
} finally {
  if ($null -eq $previousPgPassFile) {
    Remove-Item Env:\PGPASSFILE -ErrorAction SilentlyContinue
  } else {
    $env:PGPASSFILE = $previousPgPassFile
  }

  if ($null -ne $previousPgPassword) {
    $env:PGPASSWORD = $previousPgPassword
  }

  if (Test-Path -LiteralPath $pgpassPath) {
    Remove-Item -LiteralPath $pgpassPath -Force
  }
}
