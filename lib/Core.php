<?php

require_once __DIR__ . '/Defaults.php';
require_once __DIR__ . '/Elements.php';

class Core
{
    private static array $config = [];
    private static array $commands = [];

    public static function init(?string $path = null): void
    {
        if (!empty(self::$config)) {
            return;
        }
        self::loadConfig($path);
    }

    public static function loadConfig(?string $path = null): array
    {
        $base = Defaults::baseConfig();
        $configPath = $path ?? __DIR__ . '/../config/ui.json';
        $fallbackPath = __DIR__ . '/../config/ui.sample.json';

        $raw = null;
        if (is_file($configPath)) {
            $raw = file_get_contents($configPath);
        } elseif (is_file($fallbackPath)) {
            $raw = file_get_contents($fallbackPath);
        }

        $data = [];
        if ($raw !== null) {
            $data = json_decode($raw, true);
            if (!is_array($data)) {
                throw new RuntimeException('Unable to parse UI configuration JSON.');
            }
        }

        $globals = $base['globals'];
        if (isset($data['globals']) && is_array($data['globals'])) {
            $globals = array_replace_recursive($globals, $data['globals']);
        }

        $elements = $data['elements'] ?? [];
        [$normalized, $commands] = Elements::normalize($elements, $globals);

        $whitelist = [];
        if (isset($data['whitelist']) && is_array($data['whitelist'])) {
            $whitelist = array_values(array_unique(array_map('strval', $data['whitelist'])));
        }

        self::$config = [
            'globals' => $globals,
            'elements' => $normalized,
            'whitelist' => $whitelist,
        ];
        self::$commands = $commands;

        return self::$config;
    }

    public static function getConfig(): array
    {
        if (empty(self::$config)) {
            self::init();
        }
        return self::$config;
    }

    public static function getCommand(string $commandId): ?array
    {
        if (empty(self::$commands)) {
            self::init();
        }
        return self::$commands[$commandId] ?? null;
    }

    public static function sendJson($data, int $status = 200): void
    {
        http_response_code($status);
        header('Content-Type: application/json');
        echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    public static function sendError(string $message, int $status = 400, array $extra = []): void
    {
        $payload = array_merge(['ok' => false, 'error' => $message], $extra);
        self::sendJson($payload, $status);
    }

    public static function storageDir(): string
    {
        $dir = __DIR__ . '/../data';
        if (!is_dir($dir)) {
            mkdir($dir, 0775, true);
        }
        return realpath($dir) ?: $dir;
    }

    public static function storeResult(string $id, array $result): void
    {
        $safe = Defaults::sanitizeId($id);
        $path = self::storageDir() . '/' . $safe . '.json';
        file_put_contents($path, json_encode($result, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT));
    }

    public static function readResult(string $id): ?array
    {
        $safe = Defaults::sanitizeId($id);
        $path = self::storageDir() . '/' . $safe . '.json';
        if (!is_file($path)) {
            return null;
        }
        $raw = file_get_contents($path);
        $data = json_decode($raw, true);
        return is_array($data) ? $data : null;
    }
}
