<?php

class Defaults
{
    public static function baseConfig(): array
    {
        return [
            'globals' => [
                'theme' => [
                    'palette' => [
                        'primary' => '#111827',
                        'accent' => '#10B981',
                        'surface' => '#F8FAFC',
                        'muted' => '#64748B',
                        'danger' => '#DC2626',
                    ],
                    'font' => 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                    'margins' => 12,
                    'gap' => 8,
                    'layout' => 'grid',
                ],
                'defaults' => [
                    'w' => 12,
                    'h' => 2,
                    'classes' => '',
                ],
            ],
            'elements' => [],
            'whitelist' => [],
        ];
    }

    public static function sanitizeId(string $id): string
    {
        return preg_replace('/[^A-Za-z0-9_\-]/', '_', $id);
    }
}
