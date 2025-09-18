<?php
require_once __DIR__ . '/../lib/Core.php';

$error = null;
$config = [];
try {
    $config = Core::getConfig();
} catch (Throwable $e) {
    $error = $e->getMessage();
}

$embeddedConfig = $config ? json_encode($config, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) : '{}';
$fontStack = $config['globals']['theme']['font'] ?? '\'JetBrainsMono Nerd Font\', \'JetBrains Mono\', \'Fira Code\', ui-monospace, \'SFMono-Regular\', Menlo, Monaco, Consolas, \'Liberation Mono\', \'Courier New\', monospace';
$primary = $config['globals']['theme']['palette']['primary'] ?? '#111827';
$accent = $config['globals']['theme']['palette']['accent'] ?? '#10B981';
$surface = $config['globals']['theme']['palette']['surface'] ?? '#F8FAFC';
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>LocalUI</title>
    <script src="https://cdn.tailwindcss.com?plugins=forms,typography"></script>
    <link rel="stylesheet" href="/css/custom.css">
    <style>
        :root {
            --primary-color: <?= htmlspecialchars($primary, ENT_QUOTES, 'UTF-8'); ?>;
            --accent-color: <?= htmlspecialchars($accent, ENT_QUOTES, 'UTF-8'); ?>;
            --surface-color: <?= htmlspecialchars($surface, ENT_QUOTES, 'UTF-8'); ?>;
        }
        body {
            font-family: <?= htmlspecialchars($fontStack, ENT_QUOTES, 'UTF-8'); ?>;
        }
    </style>
</head>
<body class="min-h-screen text-slate-100 antialiased">
<?php if ($error): ?>
    <div class="max-w-2xl mx-auto mt-12 bg-red-50 border border-red-200 text-red-800 rounded p-6">
        <h1 class="text-xl font-semibold mb-2">Configuration Error</h1>
        <p><?= htmlspecialchars($error, ENT_QUOTES, 'UTF-8'); ?></p>
    </div>
<?php else: ?>
    <div id="app" class="min-h-screen"></div>
    <script id="app-config" type="application/json"><?= $embeddedConfig; ?></script>
    <script src="/js/app.js" defer></script>
<?php endif; ?>
</body>
</html>
