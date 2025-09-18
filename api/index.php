<?php
require_once __DIR__ . '/../lib/Core.php';
require_once __DIR__ . '/../lib/Exec.php';

try {
    Core::init();
} catch (Throwable $e) {
    Core::sendError($e->getMessage(), 500);
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$uriPath = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
$base = rtrim(dirname($_SERVER['SCRIPT_NAME'] ?? ''), '/');
if ($base !== '' && str_starts_with($uriPath, $base)) {
    $uriPath = substr($uriPath, strlen($base));
}
$uriPath = '/' . ltrim($uriPath, '/');

switch ($method) {
    case 'POST':
        if ($uriPath === '/run') {
            handle_run();
            break;
        }
        break;
    case 'GET':
        if ($uriPath === '/read') {
            handle_read();
            break;
        }
        break;
}

Core::sendError('Not Found', 404);

function handle_run(): void
{
    $raw = file_get_contents('php://input');
    $payload = json_decode($raw, true);
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

    $config = Core::getConfig();

    try {
        $result = Exec::run($command, $args, $config);
    } catch (Throwable $e) {
        Core::sendError($e->getMessage(), 400, ['commandId' => $commandId]);
    }

    $record = [
        'ok' => $result['ok'],
        'commandId' => $commandId,
        'id' => $elementId !== '' ? $elementId : null,
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
