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
            $normalized[] = self::normalizeDefinition($definition, $defaults, $seen, $commands);
        }

        return [$normalized, $commands];
    }

    private static function normalizeDefinition($definition, array $defaults, array &$seen, array &$commands): array
    {
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

        if ($definition['type'] === 'group') {
            return self::normalizeGroup($definition, $defaults, $seen, $commands);
        }

        if (!in_array($definition['type'], self::SUPPORTED_TYPES, true)) {
            throw new InvalidArgumentException('Unsupported element type: ' . $definition['type']);
        }

        $definition = self::applyDefaults($definition, $defaults);
        $definition['x'] = self::normalizeCoordinate($definition['x'] ?? null);
        $definition['y'] = self::normalizeCoordinate($definition['y'] ?? null);
        $definition = self::normalizeByType($definition);
        $definition['w'] = max(1, (int) ($definition['w'] ?? 1));
        $definition['h'] = max(1, (int) ($definition['h'] ?? 1));

        foreach (self::commandsFor($definition) as $command) {
            $commands[$command['id']] = $command;
        }

        return $definition;
    }

    private static function normalizeGroup(array $group, array $defaults, array &$seen, array &$commands): array
    {
        $group = self::applyDefaults($group, $defaults);
        $group['w'] = max(1, (int) ($group['w'] ?? 1));
        $group['h'] = max(1, (int) ($group['h'] ?? 1));
        $group['x'] = self::normalizeCoordinate($group['x'] ?? null);
        $group['y'] = self::normalizeCoordinate($group['y'] ?? null);
        $group['label'] = $group['label'] ?? $group['id'];
        $group['layout'] = in_array($group['layout'] ?? '', ['grid', 'stack'], true) ? $group['layout'] : 'grid';
        $group['columns'] = isset($group['columns']) ? max(1, (int) $group['columns']) : 12;
        $group['gap'] = isset($group['gap']) ? max(0, (int) $group['gap']) : null;

        if (!array_key_exists('elements', $group)) {
            $group['elements'] = [];
        }
        if (!is_array($group['elements'])) {
            throw new InvalidArgumentException('Group elements must be an array for group ' . $group['id']);
        }

        if (array_key_exists('border', $group)) {
            if (is_string($group['border'])) {
                $border = trim($group['border']);
                $group['border'] = $border === '' ? false : $border;
            } else {
                $group['border'] = (bool) $group['border'];
            }
        }

        if (array_key_exists('background', $group)) {
            $group['background'] = (string) $group['background'];
        }

        $childDefaults = $defaults;
        if (isset($group['defaults']) && is_array($group['defaults'])) {
            $childDefaults = array_replace($childDefaults, $group['defaults']);
        }
        unset($group['defaults']);

        $children = [];
        foreach ($group['elements'] as $child) {
            $children[] = self::normalizeDefinition($child, $childDefaults, $seen, $commands);
        }
        $group['elements'] = $children;

        return $group;
    }

    private static function normalizeCoordinate($value): ?int
    {
        if ($value === null) {
            return null;
        }
        if ($value === '' || $value === 'auto') {
            return null;
        }
        $coordinate = (int) $value;
        if ($coordinate < 0) {
            $coordinate = 0;
        }
        return $coordinate;
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
        $presentations = ['inline', 'tooltip', 'notification', 'popover', 'modal'];
        $element['presentation'] = in_array($element['presentation'] ?? '', $presentations, true)
            ? $element['presentation']
            : 'inline';
        $element['timeoutMs'] = isset($element['timeoutMs']) ? max(0, (int) $element['timeoutMs']) : 5000;

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
