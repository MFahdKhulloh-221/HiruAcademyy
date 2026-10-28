<?php

namespace App\Support;

use Illuminate\Support\Facades\DB;
use RuntimeException;

final class DatabaseSafety
{
    public static function assertTarget(bool $testing = false): void
    {
        $connection = DB::connection();
        $config = $connection->getConfig();
        $disposable = $testing && getenv('HIRU_DISPOSABLE_TESTING') === '1';
        $expected = $disposable ? ($config['database'] ?? '') : ($testing ? 'hiru_academy_test' : 'hiru_academy');
        if ($disposable) {
            $roles = ['hiru_academy_test' => 'hiru_test_runner', 'hiru_release_candidate' => 'hiru_release_runner'];
            if (! isset($roles[$expected]) || ($config['username'] ?? '') !== $roles[$expected]
                || (string) ($config['port'] ?? '') !== '55432' || ! empty($config['url'])) {
                throw new RuntimeException('Disposable database configuration rejected.');
            }
        }
        if ($connection->getDriverName() !== 'pgsql'
            || ! in_array($config['host'] ?? null, ['127.0.0.1', 'localhost', '::1'], true)
            || ($config['database'] ?? null) !== $expected
            || ! empty($config['read']) || ! empty($config['write'])) {
            throw new RuntimeException('Target PostgreSQL lokal tidak aman. Operasi dibatalkan.');
        }
        try {
            $metadata = $connection->selectOne('SELECT current_database() AS name, host(inet_server_addr()) AS host');
        } catch (\Throwable) {
            throw new RuntimeException('PostgreSQL lokal tidak tersedia. Operasi dibatalkan.');
        }
        if ($disposable) {
            $identity = $connection->selectOne("SELECT current_user AS role, shobj_description(d.oid, 'pg_database') AS marker,
                r.rolsuper, r.rolcreatedb, r.rolcreaterole, r.rolreplication
                FROM pg_database d JOIN pg_roles r ON r.rolname = current_user WHERE d.datname = current_database()");
            if ($identity->role !== $roles[$expected] || $identity->marker !== 'hiru-disposable-test-only'
                || $identity->rolsuper || $identity->rolcreatedb || $identity->rolcreaterole || $identity->rolreplication) {
                throw new RuntimeException('Disposable database identity rejected.');
            }
        }
        $host = explode('/', (string) ($metadata->host ?? ''))[0];
        if ($metadata->name !== $expected || ! in_array($host, ['127.0.0.1', '::1', 'localhost'], true)) {
            throw new RuntimeException('Metadata PostgreSQL tidak sesuai. Operasi dibatalkan.');
        }
    }
}
