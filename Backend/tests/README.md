# Isolated PostgreSQL tests

Run from `Backend/` in PowerShell. Requires local PostgreSQL test database and existing local credentials. Never use production credentials or database.

```powershell
$env:APP_ENV='testing'
$env:DB_CONNECTION='pgsql'
$env:DB_HOST='127.0.0.1'
$env:DB_DATABASE='hiru_academy_test'
$env:DB_URL=''
$env:HIRU_TEST_SCHEMA='hiru_backend_test_registration_20261012'
php tests/prepare-schema.php
php artisan test --filter='RegistrationWelcomeTest|NotificationContentTest|InvoiceTest'
```

Stop if schema preparation fails. `tests/prepare-schema.php` refuses cached/non-testing configuration, checks local host and actual PostgreSQL database through `DatabaseSafety`, and migrates only the named isolated schema. `tests/TestCase.php` checks the same target and schema before tests. Tests use transaction rollback; schema and migration records remain for reuse.

Welcome notifications require migration `2026_10_12_000001_add_personal_notification_events.php`. Isolated test preparation does not apply it to ordinary development database. Until deployment migration is applied, registration/login and notification queries requiring `user_id`/`event_key` cannot run successfully. Apply ordinary database migrations only through separately approved deployment/local-development workflow after target verification.
