import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const scriptPath = join(process.cwd(), "scripts/db/neon-to-supabase-rehearsal.ps1");

function source(): string {
  return readFileSync(scriptPath, "utf8");
}

describe("neon-to-supabase rehearsal wrapper", () => {
  it("uses pgpass files instead of password-bearing database URLs in argv", () => {
    const text = source();

    expect(text).toContain("$env:PGPASSFILE = $pgpassPath");
    expect(text).toContain("New-PgPassFile");
    expect(text).not.toContain("--dbname=$env:OLD_DB_URL");
    expect(text).not.toContain("--dbname=$env:SUPABASE_MIGRATION_DB_URL");
    expect(text).not.toContain("-d $env:OLD_DB_URL");
    expect(text).not.toContain("-d $env:SUPABASE_MIGRATION_DB_URL");
  });

  it("passes passwordless database URIs to pg_dump and psql", () => {
    const text = source();

    expect(text).toContain("ConvertTo-PgConnectionParts");
    expect(text).toContain("PasswordlessUri");
    expect(text).toContain('"--dbname=$($Source.PasswordlessUri)"');
    expect(text).toContain('"--dbname=$($Target.PasswordlessUri)"');
    expect(text).toContain('"--no-password"');
  });

  it("runs restore with fail-fast psql and then the provider audit", () => {
    const text = source();

    expect(text).toContain('"--set=ON_ERROR_STOP=1"');
    expect(text).toContain('"--single-transaction"');
    expect(text).toContain("scripts/db/provider-migration-audit.ts");
    expect(text).toContain('Assert-NativeSuccess "provider migration audit"');
    expect(text).toContain("scripts/db/provider-migration-audit.ts --mode supabase-invariants");
    expect(text).toContain('Assert-NativeSuccess "Supabase invariant audit"');
  });

  it("creates bounded dump output under output/db and deletes temp pgpass files", () => {
    const text = source();

    expect(text).toContain("output/db");
    expect(text).toContain("New-Item -ItemType Directory");
    expect(text).toContain("Remove-Item -LiteralPath $pgpassPath -Force");
  });

  it("writes one pgpass entry per line", () => {
    const text = source();

    expect(text).toContain("ConvertTo-PgPassField");
    expect(text).toContain("[System.IO.File]::WriteAllLines");
    expect(text).toContain("[System.Text.UTF8Encoding]::new($false)");
    expect(text).not.toContain("-NoNewline");
    expect(text).not.toContain("Set-Content -LiteralPath $pgpassPath");
  });

  it("detects Windows PowerShell before choosing pgpass file permissions", () => {
    const text = source();

    expect(text).toContain("function Test-IsWindows");
    expect(text).toContain("Test-IsWindows");
    expect(text).toContain("$PSVersionTable.Platform");
    expect(text).toContain('$env:OS -eq "Windows_NT"');
    expect(text).toContain("icacls.exe $pgpassPath");
    expect(text).toContain('"$($env:USERNAME):F"');
  });

  it("uses a real output/db path boundary instead of a substring check", () => {
    const text = source();

    expect(text).toContain("$outputDbDir = [System.IO.Path]::GetFullPath");
    expect(text).toContain("$dumpDir.StartsWith($outputDbPrefix");
    expect(text).not.toContain('.Contains("output\\db")');
  });

  it("can run Postgres client tools from an explicit Docker container", () => {
    const text = source();

    expect(text).toContain("PG_TOOLS_DOCKER_CONTAINER");
    expect(text).toContain("Invoke-DockerPgTools");
    expect(text).toContain('Assert-CommandAvailable "docker"');
    expect(text).toContain("docker @Arguments");
    expect(text).toContain('"cp",');
    expect(text).toContain('"exec",');
    expect(text).toContain('"chmod"');
    expect(text).toContain('"600"');
    expect(text).toContain('"PGPASSFILE=$containerPgPassPath"');
    expect(text).toContain('"pg_dump"');
    expect(text).toContain('"psql"');
  });

  it("keeps Docker pgpass and dump files in bounded temp paths and removes them", () => {
    const text = source();

    expect(text).toContain('"/tmp/grantpipe-pgpass-$token.conf"');
    expect(text).toContain('"/tmp/grantpipe-dump-$token.sql"');
    expect(text).toContain("function Invoke-DockerCleanup");
    expect(text).toContain("docker exec $Container rm -f -- @Paths");
    expect(text).toContain("Docker cleanup failed");
    expect(text).not.toContain("PGPASSWORD=");
  });

  it("checks host client tool availability before the native path", () => {
    const text = source();

    expect(text).toContain("function Assert-CommandAvailable");
    expect(text).toContain('Assert-CommandAvailable "pg_dump"');
    expect(text).toContain('Assert-CommandAvailable "psql"');
  });

  it("fails closed when source and target provider hosts are swapped", () => {
    const text = source();

    expect(text).toContain("function Assert-ExpectedProviderUrl");
    expect(text).toContain('Assert-ExpectedProviderUrl -Name "OLD_DB_URL"');
    expect(text).toContain('Assert-ExpectedProviderUrl -Name "SUPABASE_MIGRATION_DB_URL"');
    expect(text).toContain('$dbHostName.EndsWith(".neon.tech")');
    expect(text).toContain('$dbHostName.EndsWith(".supabase.co")');
    expect(text).toContain('$dbHostName.EndsWith(".supabase.com")');
    expect(text).toContain("ALLOW_LOCAL_DB_REHEARSAL");
  });
});
