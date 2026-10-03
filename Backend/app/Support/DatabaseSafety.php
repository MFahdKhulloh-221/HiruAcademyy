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
        $expected = $testing ? 'hiru_academy_test' : 'hiru_academy';
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
        $host = explode('/', (string) ($metadata->host ?? ''))[0];
        if ($metadata->name !== $expected || ! in_array($host, ['127.0.0.1', '::1', 'localhost'], true)) {
            throw new RuntimeException('Metadata PostgreSQL tidak sesuai. Operasi dibatalkan.');
        }
    }
}
