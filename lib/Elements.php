<?php

require_once __DIR__ . '/Defaults.php';

class Elements
{
    private const SUPPORTED_TYPES = ['button', 'toggle', 'stepper', 'input', 'output'];

    public static function normalize(array $elements, array $globals): array
    {
        $normalized = [];
        $commands = [];
        $ids = [];
        foreach ($elements as $element) {
            if (!is_array($element)) {
                throw new InvalidArgumentException('Element definition must be an object.');
            }
            if (empty($element['id']) || empty($element['type'])) {
                throw new InvalidArgumentException('Each element requires an id and type.');
            }
            $element['id'] = Defaults::sanitizeId((string) $element['id']);
            if (!in_array($element['type'], self::SUPPORTED_TYPES, true)) {
                throw new InvalidArgumentException('Unsupported element type: ' . $element['type']);
            }
            if (isset($ids[$element['id']])) {
                throw new InvalidArgumentException('Duplicate element id: ' . $element['id']);
            }
            $ids[$element['id']] = true;

            $element = self::applyDefaults($element, $globals);
            $normalized[] = $element;
            foreach (self::collectCommands($element) as $command) {
                $commands[$command['id']] = $command;
            }
        }

        return [$normalized, $commands];
    }

    private static function applyDefaults(array $element, array $globals): array
    {
        $defaults = $globals['defaults'] ?? [];
        foreach ($defaults as $key => $value) {
            if (!isset($element[$key])) {
                $element[$key] = $value;
            }
        }

        if (!isset($element['classes'])) {
            $element['classes'] = '';
        }
        if (!empty($defaults['classes']) && strpos($element['classes'], $defaults['classes']) === false) {
            $element['classes'] = trim($element['classes'] . ' ' . $defaults['classes']);
        }

        switch ($element['type']) {
            case 'button':
                $element['label'] = $element['label'] ?? $element['id'];
                if (isset($element['command'])) {
                    $element['command'] = self::normalizeCommandWrapper($element['command'], $element['id'], 'button');
                }
                break;
            case 'toggle':
                $element['label'] = $element['label'] ?? $element['id'];
                $element['initial'] = (bool) ($element['initial'] ?? false);
                if (isset($element['onCommand'])) {
                    $element['onCommand'] = self::normalizeCommandWrapper($element['onCommand'], $element['id'], 'on');
                }
                if (isset($element['offCommand'])) {
                    $element['offCommand'] = self::normalizeCommandWrapper($element['offCommand'], $element['id'], 'off');
                }
                break;
            case 'stepper':
                $element['label'] = $element['label'] ?? $element['id'];
                $element['min'] = isset($element['min']) ? (int) $element['min'] : 0;
                $element['max'] = isset($element['max']) ? (int) $element['max'] : 100;
                $element['step'] = isset($element['step']) ? (int) $element['step'] : 1;
                $element['value'] = isset($element['value']) ? (int) $element['value'] : $element['min'];
                if ($element['value'] < $element['min']) {
                    $element['value'] = $element['min'];
                }
                if ($element['value'] > $element['max']) {
                    $element['value'] = $element['max'];
                }
                if (isset($element['command'])) {
                    $element['command'] = self::normalizeCommandWrapper($element['command'], $element['id'], 'stepper');
                }
                break;
            case 'input':
                $element['label'] = $element['label'] ?? $element['id'];
                $element['inputType'] = $element['inputType'] ?? 'string';
                if (isset($element['apply'])) {
                    $element['apply'] = self::normalizeApply($element['apply'], $element['id']);
                }
                break;
            case 'output':
                $element['label'] = $element['label'] ?? $element['id'];
                $element['mode'] = $element['mode'] ?? 'manual';
                $element['intervalMs'] = isset($element['intervalMs']) ? (int) $element['intervalMs'] : 5000;
                if (isset($element['command'])) {
                    $element['command'] = self::normalizeCommandWrapper($element['command'], $element['id'], 'output');
                }
                if (!isset($element['onDemandButtonLabel'])) {
                    $element['onDemandButtonLabel'] = 'Refresh';
                }
                if (!isset($element['h'])) {
                    $element['h'] = 4;
                }
                break;
        }

        return $element;
    }

    private static function normalizeCommandWrapper(array $commandWrapper, string $elementId, string $suffix): array
    {
        if (isset($commandWrapper['server'])) {
            $commandWrapper['server'] = self::normalizeServerCommand($commandWrapper['server'], $elementId, $suffix);
        } elseif (isset($commandWrapper['template'])) {
            $commandWrapper = [
                'server' => self::normalizeServerCommand($commandWrapper, $elementId, $suffix),
            ];
        }

        if (isset($commandWrapper['client']) && is_array($commandWrapper['client'])) {
            if (!isset($commandWrapper['client']['script'])) {
                throw new InvalidArgumentException('Client command requires a script field.');
            }
            $commandWrapper['client']['script'] = (string) $commandWrapper['client']['script'];
        }

        return $commandWrapper;
    }

    private static function normalizeServerCommand(array $command, string $elementId, string $suffix): array
    {
        if (empty($command['template'])) {
            throw new InvalidArgumentException('Server command template cannot be empty for element ' . $elementId);
        }
        $command['template'] = trim((string) $command['template']);
        $command['id'] = Defaults::sanitizeId($command['id'] ?? ($elementId . '_' . $suffix));

        return $command;
    }

    private static function normalizeApply(array $apply, string $elementId): array
    {
        $apply['label'] = $apply['label'] ?? 'Apply';
        if (isset($apply['command'])) {
            $apply['command'] = self::normalizeCommandWrapper($apply['command'], $elementId, 'input');
        }
        return $apply;
    }

    private static function collectCommands(array $element): array
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
                if (isset($element['apply'])) {
                    $candidates[] = $element['apply']['command'] ?? null;
                }
                break;
            case 'output':
                $candidates[] = $element['command'] ?? null;
                break;
        }

        foreach ($candidates as $candidate) {
            if (isset($candidate['server']) && isset($candidate['server']['id'])) {
                $commands[$candidate['server']['id']] = $candidate['server'];
            }
        }

        return $commands;
    }
}
