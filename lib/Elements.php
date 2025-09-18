<?php

require_once __DIR__ . '/Defaults.php';

class Elements
{
    private const SUPPORTED_TYPES = ['button', 'toggle', 'stepper', 'input', 'output'];

    public static function normalize(array $elements, array $globals): array
    {
        $defaults = $globals['defaults'] ?? [];
        $normalized = [];
        $commands = [];
        $seen = [];

        foreach ($elements as $definition) {
            if (!is_array($definition)) {
                throw new InvalidArgumentException('Element definition must be an object.');
            }
            if (empty($definition['id']) || empty($definition['type'])) {
                throw new InvalidArgumentException('Each element requires an id and type.');
            }

            $definition['id'] = Defaults::sanitizeId((string) $definition['id']);
            if (isset($seen[$definition['id']])) {
                throw new InvalidArgumentException('Duplicate element id: ' . $definition['id']);
            }
            $seen[$definition['id']] = true;

            if (!in_array($definition['type'], self::SUPPORTED_TYPES, true)) {
                throw new InvalidArgumentException('Unsupported element type: ' . $definition['type']);
            }

            $definition = self::applyDefaults($definition, $defaults);
            $definition = self::normalizeByType($definition);
            $normalized[] = $definition;

            foreach (self::commandsFor($definition) as $command) {
                $commands[$command['id']] = $command;
            }
        }

        return [$normalized, $commands];
    }

    private static function applyDefaults(array $element, array $defaults): array
    {
        foreach ($defaults as $key => $value) {
            if (!array_key_exists($key, $element)) {
                $element[$key] = $value;
            }
        }

        if (!empty($defaults['classes'])) {
            $existing = trim((string) ($element['classes'] ?? ''));
            $element['classes'] = trim($existing . ' ' . $defaults['classes']);
        } else {
            $element['classes'] = $element['classes'] ?? '';
        }

        return $element;
    }

    private static function normalizeByType(array $element): array
    {
        switch ($element['type']) {
            case 'button':
                $element['label'] = $element['label'] ?? $element['id'];
                $element['command'] = self::normalizeCommand($element['command'] ?? null, $element['id'], 'button');
                break;

            case 'toggle':
                $element['label'] = $element['label'] ?? $element['id'];
                $element['initial'] = (bool) ($element['initial'] ?? false);
                $element['onCommand'] = self::normalizeCommand($element['onCommand'] ?? null, $element['id'], 'on');
                $element['offCommand'] = self::normalizeCommand($element['offCommand'] ?? null, $element['id'], 'off');
                break;

            case 'stepper':
                $element['label'] = $element['label'] ?? $element['id'];
                $element['min'] = isset($element['min']) ? (int) $element['min'] : 0;
                $element['max'] = isset($element['max']) ? (int) $element['max'] : 100;
                $element['step'] = isset($element['step']) ? (int) $element['step'] : 1;
                $element['value'] = isset($element['value']) ? (int) $element['value'] : $element['min'];
                $element['command'] = self::normalizeCommand($element['command'] ?? null, $element['id'], 'step');
                break;

            case 'input':
                $element['label'] = $element['label'] ?? $element['id'];
                $element['inputType'] = $element['inputType'] ?? 'string';
                if (isset($element['apply'])) {
                    $element['apply']['label'] = $element['apply']['label'] ?? 'Apply';
                    $element['apply']['command'] = self::normalizeCommand($element['apply']['command'] ?? null, $element['id'], 'input');
                }
                break;

            case 'output':
                $element['label'] = $element['label'] ?? $element['id'];
                $element['mode'] = in_array($element['mode'] ?? '', ['poll', 'manual'], true) ? $element['mode'] : 'manual';
                $element['intervalMs'] = isset($element['intervalMs']) ? (int) $element['intervalMs'] : 5000;
                $element['command'] = self::normalizeCommand($element['command'] ?? null, $element['id'], 'output');
                $element['onDemandButtonLabel'] = $element['onDemandButtonLabel'] ?? 'Refresh';
                if (!isset($element['h'])) {
                    $element['h'] = 4;
                }
                break;
        }

        return $element;
    }

    private static function normalizeCommand(?array $wrapper, string $elementId, string $suffix): ?array
    {
        if (!$wrapper) {
            return null;
        }

        $server = $wrapper['server'] ?? $wrapper;
        if (empty($server['template'])) {
            throw new InvalidArgumentException('Server command template missing for element ' . $elementId);
        }

        $server['template'] = trim((string) $server['template']);
        $server['id'] = Defaults::sanitizeId($server['id'] ?? ($elementId . '_' . $suffix));

        $normalized = ['server' => $server];
        if (isset($wrapper['client'])) {
            $script = (string) ($wrapper['client']['script'] ?? '');
            if ($script === '') {
                throw new InvalidArgumentException('Client script cannot be empty for element ' . $elementId);
            }
            $normalized['client'] = ['script' => $script];
        }

        return $normalized;
    }

    private static function commandsFor(array $element): array
    {
        $commands = [];
        $candidates = [];

        switch ($element['type']) {
            case 'button':
                $candidates[] = $element['command'] ?? null;
                break;
            case 'toggle':
                $candidates[] = $element['onCommand'] ?? null;
                $candidates[] = $element['offCommand'] ?? null;
                break;
            case 'stepper':
                $candidates[] = $element['command'] ?? null;
                break;
            case 'input':
                $candidates[] = $element['apply']['command'] ?? null;
                break;
            case 'output':
                $candidates[] = $element['command'] ?? null;
                break;
        }

        foreach ($candidates as $candidate) {
            if (isset($candidate['server'])) {
                $commands[] = $candidate['server'];
            }
        }

        return $commands;
    }
}
