param([ValidateSet('serve', 'fixtures', 'verify')][string]$Action = 'serve')
$ErrorActionPreference = 'Stop'
$backend = Split-Path $PSScriptRoot -Parent
$frontend = Join-Path (Split-Path $backend -Parent) 'Frontend'
$psql = if ($env:PG_BIN) { Join-Path $env:PG_BIN 'psql' } else { 'psql' }
$psql = (Get-Command $psql -ErrorAction Stop).Source
if (-not $env:DB_PASSWORD -and -not $env:PGPASSWORD) {
    throw 'Set DB_PASSWORD or PGPASSWORD for isolated hiru_test_runner database.'
}
if (-not $env:DB_PASSWORD) { $env:DB_PASSWORD = $env:PGPASSWORD }
$env:PGPASSWORD = $env:DB_PASSWORD
$env:APP_ENV = 'testing'
$env:DB_CONNECTION = 'pgsql'
$env:DB_HOST = '127.0.0.1'
$env:DB_PORT = '55432'
$env:DB_DATABASE = 'hiru_academy_test'
$env:DB_USERNAME = 'hiru_test_runner'
$env:DB_URL = ''
$env:HIRU_DISPOSABLE_TESTING = '1'
$env:HIRU_TEST_SCHEMA = 'hiru_backend_test_community49'
$env:PGOPTIONS = '-c search_path=hiru_backend_test_community49'
$guard = & $psql -X -w -h 127.0.0.1 -p 55432 -U hiru_test_runner -d hiru_academy_test -At -v ON_ERROR_STOP=1 -c "SELECT current_database()='hiru_academy_test' AND current_user='hiru_test_runner' AND host(inet_server_addr())='127.0.0.1' AND inet_server_port()=55432 AND current_schema()='hiru_backend_test_community49' AND shobj_description(d.oid,'pg_database')='hiru-disposable-test-only' AND NOT r.rolsuper AND NOT r.rolcreatedb AND NOT r.rolcreaterole AND NOT r.rolreplication AND NOT r.rolbypassrls FROM pg_database d JOIN pg_roles r ON r.rolname=current_user WHERE d.datname=current_database()"
if ($LASTEXITCODE -ne 0 -or $guard -ne 't') { throw 'Isolation rejected.' }
Write-Output 'Disposable identity/schema preflight PASS. HTTP uses real database sessions and CSRF.'

function New-RandomBase64 {
    $bytes = New-Object byte[] 32
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    return [Convert]::ToBase64String($bytes)
}
$env:APP_KEY = 'base64:' + (New-RandomBase64)
$env:APP_URL = 'http://localhost:8049'
$env:FRONTEND_URL = 'http://localhost:3039'
$env:CORS_ALLOWED_ORIGINS = 'http://localhost:3039'
$env:SANCTUM_STATEFUL_DOMAINS = 'localhost:3039,localhost:8049'
$env:SESSION_DRIVER = 'database'
$env:SESSION_COOKIE = 'hiru_community_b3'
$env:SESSION_DOMAIN = 'localhost'
$env:SESSION_SECURE_COOKIE = 'false'
$env:CACHE_STORE = 'database'
$env:QUEUE_CONNECTION = 'sync'
$env:MAIL_MAILER = 'array'
$env:APP_DEBUG = 'false'
$fixturePath = if ($env:HIRU_HTTP_FIXTURES) { $env:HIRU_HTTP_FIXTURES } else { 'test-results/community-http-fixtures.json' }
if (-not [System.IO.Path]::IsPathRooted($fixturePath)) { $fixturePath = Join-Path $frontend $fixturePath }
$env:HIRU_HTTP_FIXTURES = [System.IO.Path]::GetFullPath($fixturePath)

Push-Location $backend
try {
    if ($Action -eq 'verify') {
        & $psql -X -w -h 127.0.0.1 -p 55432 -U hiru_test_runner -d hiru_academy_test -At -v ON_ERROR_STOP=1 -c "SELECT count(*) AS persisted_http_messages FROM community_messages WHERE content LIKE 'B3 HTTP%'; SELECT title,content FROM community_threads WHERE title LIKE 'HTTP Arsip Lama %';"
        if ($LASTEXITCODE -ne 0) { throw 'HTTP persistence verification failed.' }
    } else {
        $env:HIRU_HTTP_RUN = [Guid]::NewGuid().ToString('N').Substring(0, 12)
        $env:HIRU_HTTP_PASSWORD = New-RandomBase64
        & php tests/community-http-fixtures.php
        if ($LASTEXITCODE -ne 0) { throw 'HTTP fixture generation failed; server not started.' }
        if ($Action -eq 'serve') {
            & php -S localhost:8049 -t public
            if ($LASTEXITCODE -ne 0) { throw 'HTTP server failed.' }
        }
    }
} finally { Pop-Location }
