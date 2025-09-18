<?php
require_once __DIR__ . '/../lib/Core.php';
require_once __DIR__ . '/../lib/Exec.php';

try {
    Core::init();
} catch (Throwable $e) {
    Core::sendError($e->getMessage(), 500);
}

$route = defined('API_ROUTE')
    ? API_ROUTE
    : ltrim(parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH) ?? '', '/');
$route = str_starts_with($route, 'api/') ? substr($route, 4) : $route;
$route = $route === '' ? 'run' : $route;
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($route === 'run' && $method === 'POST') {
    handle_run();
    return;
}

if ($route === 'read' && $method === 'GET') {
    handle_read();
    return;
}

if ($route === 'config' && $method === 'GET') {
    handle_config();
    return;
}

Core::sendError('Not Found', 404);

function handle_run(): void
{
    $raw = file_get_contents('php://input');
    $payload = json_decode($raw ?: '[]', true);
    if (!is_array($payload)) {
        Core::sendError('Invalid JSON payload.');
    }

    $elementId = isset($payload['id']) ? Defaults::sanitizeId((string) $payload['id']) : '';
    $commandId = isset($payload['commandId']) ? Defaults::sanitizeId((string) $payload['commandId']) : '';
    $args = isset($payload['args']) && is_array($payload['args']) ? $payload['args'] : [];

    if ($commandId === '') {
        Core::sendError('commandId is required.');
    }

    $command = Core::getCommand($commandId);
    if (!$command) {
        Core::sendError('Unknown command: ' . $commandId, 404);
    }

    try {
        $result = Exec::run($command, $args, Core::getConfig());
    } catch (Throwable $e) {
        Core::sendError($e->getMessage(), 400, ['commandId' => $commandId]);
    }

    $record = [
        'ok' => $result['ok'],
        'id' => $elementId !== '' ? $elementId : null,
        'commandId' => $commandId,
        'result' => $result,
    ];

    $storeId = $elementId !== '' ? $elementId : $commandId;
    Core::storeResult($storeId, $record);

    Core::sendJson($record);
}

function handle_read(): void
{
    $id = isset($_GET['id']) ? Defaults::sanitizeId((string) $_GET['id']) : '';
    if ($id === '') {
        Core::sendError('id is required.');
    }

    $record = Core::readResult($id);
    if (!$record) {
        Core::sendError('No stored result for id: ' . $id, 404);
    }

    Core::sendJson($record);
}

function handle_config(): void
{
    $name = isset($_GET['name']) ? trim((string) $_GET['name']) : '';
    $path = null;

    if ($name !== '') {
        [$resolved, $error] = resolve_config_path($name);
        if ($error === 'invalid') {
            Core::sendError('Invalid configuration name.', 400);
        }
        if ($error === 'missing') {
            Core::sendError('Configuration not found: ' . $name, 404);
        }
        $path = $resolved;
    }

    try {
        $config = Core::loadConfig($path);
    } catch (Throwable $e) {
        Core::sendError($e->getMessage(), 500);
    }

    Core::sendJson([
        'ok' => true,
        'config' => $config,
        'profile' => $name,
    ]);
}

function resolve_config_path(string $name): array
{
    $trimmed = trim($name);
    if ($trimmed === '') {
        return [null, null];
    }

    if (str_contains($trimmed, '..') || str_starts_with($trimmed, '/')) {
        return [null, 'invalid'];
    }

    $normalized = str_replace('\\', '/', $trimmed);
    if (!preg_match('/^[A-Za-z0-9_\-\/\.]+$/', $normalized)) {
        return [null, 'invalid'];
    }

    $configDir = realpath(__DIR__ . '/../config');
    if ($configDir === false) {
        return [null, 'invalid'];
    }

    $candidate = $configDir . '/' . $normalized;
    if (!str_ends_with($normalized, '.json')) {
        $candidate .= '.json';
    }

    if (!is_file($candidate)) {
        return [null, 'missing'];
    }

    $resolved = realpath($candidate);
    if ($resolved === false || strpos($resolved, $configDir) !== 0) {
        return [null, 'invalid'];
    }

    return [$resolved, null];
}
