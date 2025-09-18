<?php

class Exec
{
    public static function run(array $command, array $args, array $config): array
    {
        if (empty($command['template'])) {
            throw new InvalidArgumentException('Command template is required.');
        }

        $tokens = self::tokenize($command['template']);
        if (empty($tokens)) {
            throw new InvalidArgumentException('Command template produced no executable tokens.');
        }

        $tokens = self::substituteTokens($tokens, $args);

        $binary = $tokens[0];
        $allowed = $config['whitelist'] ?? [];
        self::assertAllowedBinary($binary, $allowed);
        $resolvedBinary = self::resolveBinary($binary);

        $commandList = array_merge([$resolvedBinary], array_slice($tokens, 1));

        $descriptorSpec = [
            0 => ['pipe', 'r'],
            1 => ['pipe', 'w'],
            2 => ['pipe', 'w'],
        ];

        $process = proc_open($commandList, $descriptorSpec, $pipes);
        if (!is_resource($process)) {
            throw new RuntimeException('Unable to start process for command: ' . $binary);
        }

        fclose($pipes[0]);
        stream_set_blocking($pipes[1], true);
        stream_set_blocking($pipes[2], true);
        $stdout = stream_get_contents($pipes[1]);
        $stderr = stream_get_contents($pipes[2]);
        fclose($pipes[1]);
        fclose($pipes[2]);

        $exitCode = proc_close($process);

        return [
            'ok' => $exitCode === 0,
            'code' => $exitCode,
            'stdout' => $stdout,
            'stderr' => $stderr,
            'ts' => date(DATE_ATOM),
        ];
    }

    private static function tokenize(string $template): array
    {
        $pattern = "/\"([^\"\\\\]*(?:\\\\.[^\"\\\\]*)*)\"|'([^'\\\\]*(?:\\\\.[^'\\\\]*)*)'|(\\S+)/";
        preg_match_all($pattern, $template, $matches, PREG_SET_ORDER);
        $tokens = [];
        foreach ($matches as $match) {
            if (!empty($match[1])) {
                $tokens[] = stripcslashes($match[1]);
            } elseif (!empty($match[2])) {
                $tokens[] = stripcslashes($match[2]);
            } elseif (!empty($match[3])) {
                $tokens[] = $match[3];
            }
        }
        return $tokens;
    }

    private static function substituteTokens(array $tokens, array $args): array
    {
        $processed = [];
        foreach ($tokens as $token) {
            $value = preg_replace_callback('/\$\{([A-Za-z0-9_]+)\}/', function ($matches) use ($args) {
                $key = $matches[1];
                if (!array_key_exists($key, $args)) {
                    throw new InvalidArgumentException('Missing argument: ' . $key);
                }
                return self::sanitizeArg($args[$key]);
            }, $token);
            $processed[] = $value;
        }
        return $processed;
    }

    private static function sanitizeArg($value): string
    {
        if (is_bool($value)) {
            $value = $value ? '1' : '0';
        } elseif (is_int($value) || is_float($value)) {
            $value = (string) $value;
        } elseif ($value === null) {
            $value = '';
        } elseif (!is_string($value)) {
            $value = json_encode($value);
        }

        $value = (string) $value;
        if (preg_match('/[\x00-\x1F\x7F]/', $value)) {
            throw new InvalidArgumentException('Argument contains control characters.');
        }
        if (preg_match('/[;&|`$<>]/', $value)) {
            throw new InvalidArgumentException('Argument contains forbidden characters.');
        }

        return $value;
    }

    private static function assertAllowedBinary(string $binary, array $allowed): void
    {
        if ($binary === '') {
            throw new InvalidArgumentException('Empty binary.');
        }
        if (strpos($binary, '/') !== false) {
            throw new InvalidArgumentException('Binary paths are not allowed; use whitelist names only.');
        }
        $base = basename($binary);
        if (!in_array($base, $allowed, true)) {
            throw new RuntimeException('Binary not whitelisted: ' . $base);
        }
    }

    private static function resolveBinary(string $binary): string
    {
        $paths = explode(PATH_SEPARATOR, getenv('PATH') ?: '');
        foreach ($paths as $dir) {
            $candidate = rtrim($dir, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . $binary;
            if (is_file($candidate) && is_executable($candidate)) {
                return $candidate;
            }
        }
        throw new RuntimeException('Binary not found in PATH: ' . $binary);
    }
}
