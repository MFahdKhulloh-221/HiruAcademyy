# Run manually in Windows PowerShell. No SMTP probe or email is sent by this script.
& {
    $ErrorActionPreference = 'Stop'
    $backend = Split-Path $PSScriptRoot -Parent
    $secret = $null
    $pointer = [IntPtr]::Zero
    $plain = $null
    $server = $null
    $starts = @()
    try {
        $php = (Get-Command php -CommandType Application).Source
        Write-Host 'Only an existing disposable DB is allowed: hiru_academy_test on loopback:55432, role hiru_test_runner, marker hiru-disposable-test-only.'
        Write-Host 'No database will be created, migrated, seeded, or reset.'
        $email = (Read-Host 'Approved active student TEST account Gmail').Trim()
        if ($email -notmatch '^[^@\s]+@gmail\.com$') { throw 'A Gmail test account is required.' }
        $approval = Read-Host 'Confirm disposable DB and account contain no real user data: type APPROVE OTP TEST'
        if ($approval -cne 'APPROVE OTP TEST') { throw 'Approval missing.' }
        $secret = Read-Host 'Resend API Key (hidden)' -AsSecureString
        if (!$secret.Length) { throw 'API Key is empty.' }
        $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
        $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)

        function New-TestProcessInfo([string] $arguments) {
            $info = New-Object System.Diagnostics.ProcessStartInfo
            $info.FileName = $php
            $info.WorkingDirectory = $backend
            $info.UseShellExecute = $false
            $info.Arguments = $arguments
            # Only child processes receive these overrides. Parent environment stays intact.
            $info.EnvironmentVariables['APP_ENV'] = 'local'
            $info.EnvironmentVariables['APP_DEBUG'] = 'false'
            $info.EnvironmentVariables['HIRU_LOCAL_RESEND'] = '1'
            $info.EnvironmentVariables['HIRU_LOCAL_RESEND_KEY'] = $plain
            $info.EnvironmentVariables['HIRU_DISPOSABLE_TESTING'] = '1'
            $info.EnvironmentVariables['DB_CONNECTION'] = 'pgsql'
            $info.EnvironmentVariables['DB_URL'] = ''
            $info.EnvironmentVariables['DB_HOST'] = '127.0.0.1'
            $info.EnvironmentVariables['DB_PORT'] = '55432'
            $info.EnvironmentVariables['DB_DATABASE'] = 'hiru_academy_test'
            $info.EnvironmentVariables['DB_USERNAME'] = 'hiru_test_runner'
            # DB password comes from existing local config; no secret is requested or changed here.
            $info.EnvironmentVariables['SESSION_DRIVER'] = 'database'
            $info.EnvironmentVariables['SESSION_CONNECTION'] = 'pgsql'
            $info.EnvironmentVariables['CACHE_STORE'] = 'database'
            $info.EnvironmentVariables['QUEUE_CONNECTION'] = 'sync'
            $info.EnvironmentVariables['OTP_TEST_EMAIL'] = $email
            return $info
        }

        $check = @'
try {
    require 'vendor/autoload.php';
    $app = require 'bootstrap/app.php';
    $app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
    if (!$app->environment('local') || $app->configurationIsCached()
        || config('app.debug') || config('mail.default') !== 'local_resend'
        || config('mail.mailers.local_resend.scheme') !== 'smtps'
        || config('mail.mailers.local_resend.host') !== 'smtp.resend.com'
        || config('mail.mailers.local_resend.port') !== 465
        || config('mail.from.address') !== 'noreply@mail.hiruacademy.id'
        || config('session.driver') !== 'database'
        || config('session.connection') !== 'pgsql') {
        throw new RuntimeException();
    }
    App\Support\DatabaseSafety::assertTarget(true);
    $email = App\Support\Identity::email(getenv('OTP_TEST_EMAIL'));
    $user = App\Models\User::where('email_normalized', $email)
        ->where('account_status', 'active')->where('role', 'student')->first();
    if (!$user) { throw new RuntimeException(); }
    foreach (['users', 'sessions', 'cache', 'cache_locks', config('auth.passwords.users.table')] as $table) {
        if (!Illuminate\Support\Facades\Schema::hasTable($table)) { throw new RuntimeException(); }
    }
    echo "PASS: local SMTPS config; disposable DB identity; approved account exists. No email sent.\n";
} catch (Throwable) {
    fwrite(STDERR, "BLOCKED: check uncached local config, disposable DB role/marker/credentials/schema and active test account. No email sent.\n");
    exit(1);
}
'@
        $encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($check))
        $checkInfo = New-TestProcessInfo ('-d display_errors=0 -d log_errors=0 -r "eval(base64_decode(''' + $encoded + '''));"')
        $starts += $checkInfo
        $checkProcess = New-Object System.Diagnostics.Process
        try {
            $checkProcess.StartInfo = $checkInfo
            $null = $checkProcess.Start()
            $checkProcess.WaitForExit()
            if ($checkProcess.ExitCode -ne 0) { throw 'Preflight blocked. Server not started.' }
        } finally { $checkProcess.Dispose() }

        $serverInfo = New-TestProcessInfo '-d display_errors=0 -d log_errors=0 artisan serve --host=127.0.0.1 --port=8000 --no-reload'
        $starts += $serverInfo
        $server = New-Object System.Diagnostics.Process
        $server.StartInfo = $serverInfo
        $null = $server.Start()
        $plain = $null
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
        $pointer = [IntPtr]::Zero
        $secret.Dispose()
        $secret = $null
        foreach ($info in $starts) { $info.EnvironmentVariables.Remove('HIRU_LOCAL_RESEND_KEY') }
        Write-Host 'Test server started on http://127.0.0.1:8000. Only use the approved test account.'
        Write-Host 'Use frontend with NEXT_PUBLIC_API_URL=http://localhost:8000 and open frontend on localhost.'
        $null = Read-Host 'After browser OTP test, press Enter to stop server'
    } catch {
        Write-Host 'BLOCKED/stopped. Do not paste credentials or SMTP debug output into chat.'
    } finally {
        if ($server) {
            try {
                if (!$server.HasExited) {
                    # Stop artisan and its PHP server child together (Windows).
                    & taskkill.exe /PID $server.Id /T /F | Out-Null
                    $server.WaitForExit()
                }
            } catch {}
            $server.Dispose()
        }
        foreach ($info in $starts) { $info.EnvironmentVariables.Remove('HIRU_LOCAL_RESEND_KEY') }
        if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
        if ($secret) { $secret.Dispose() }
        $plain = $null
        Remove-Variable plain, secret, pointer -ErrorAction SilentlyContinue
    }
}
