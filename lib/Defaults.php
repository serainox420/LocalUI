<?php

class Defaults
{
    public static function baseConfig(): array
    {
        return [
            'globals' => [
                'theme' => [
                    'palette' => [
                        'primary' => '#4338CA',
                        'accent' => '#0EA5E9',
                        'surface' => '#020817',
                        'muted' => '#94A3B8',
                        'danger' => '#F87171',
                    ],
                    'font' => 'Roboto, "Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
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
