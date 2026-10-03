<?php

namespace App\Support;

final class Identity
{
    public static function email(string $value): string
    {
        return mb_strtolower(trim($value));
    }

    public static function phone(string $value): string
    {
        $value = trim($value);
        if (! preg_match('/^\+?[0-9][0-9 ()-]*$/D', $value)) {
            return '';
        }
        $digits = preg_replace('/[^0-9]/', '', $value);

        return str_starts_with($digits, '0') && ! str_starts_with($value, '+')
            ? '62'.substr($digits, 1) : $digits;
    }
}
