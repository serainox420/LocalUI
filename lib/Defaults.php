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
                    'font' => '\'JetBrainsMono Nerd Font\', \'JetBrains Mono\', \'Fira Code\', ui-monospace, \'SFMono-Regular\', Menlo, Monaco, Consolas, \'Liberation Mono\', \'Courier New\', monospace',
                    'margins' => 24,
                    'gap' => 16,
                    'layout' => 'grid',
                ],
                'surface' => [
                    'width' => 1200,
                    'height' => 720,
                    'gridSize' => null,
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
