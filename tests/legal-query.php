<?php
/**
 * Read-only SQLite query helper for the legal-pages test suite.
 *
 * The legal suite has to prove things the API deliberately does not expose —
 * that an existing account has NO acceptance rows, that both acceptances name
 * the version and the time, that the audit log recorded the publisher. This tool
 * answers those questions against the test database file only.
 *
 * The SQL and the parameters arrive base64-encoded so that no quote, space or
 * semicolon in a test value can change the statement. Only SELECT statements are
 * accepted, and only the file named on the command line is opened.
 *
 *   php tests/legal-query.php --path=DB --sql=<base64> [--param=<base64 json>]
 *
 * Output: one JSON object, `{ ok: true, rows: [...] }`, on stdout.
 */

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    echo json_encode(['error' => 'CLI only']);
    exit;
}

function arg(string $name, ?string $default = null): ?string
{
    global $argv;
    foreach ($argv as $item) {
        if (str_starts_with($item, '--' . $name . '=')) {
            return substr($item, strlen($name) + 3);
        }
    }

    return $default;
}

$path = (string)arg('path', '');
$encodedSql = (string)arg('sql', '');
if ($path === '' || !is_file($path)) {
    echo json_encode(['ok' => false, 'error' => 'Missing or unknown --path']) . "\n";
    exit(2);
}

$sql = base64_decode($encodedSql, true);
if (!is_string($sql) || trim($sql) === '') {
    echo json_encode(['ok' => false, 'error' => 'Missing --sql']) . "\n";
    exit(2);
}
if (!preg_match('/^\s*SELECT\s/i', $sql)) {
    echo json_encode(['ok' => false, 'error' => 'Only SELECT statements are allowed']) . "\n";
    exit(2);
}

$params = [];
$encodedParams = arg('param');
if ($encodedParams !== null && $encodedParams !== '') {
    $decoded = base64_decode($encodedParams, true);
    $parsed = is_string($decoded) ? json_decode($decoded, true) : null;
    if (!is_array($parsed)) {
        echo json_encode(['ok' => false, 'error' => 'Could not read --param']) . "\n";
        exit(2);
    }
    foreach ($parsed as $name => $value) {
        $params[':' . ltrim((string)$name, ':')] = is_bool($value) ? (int)$value : $value;
    }
}

try {
    $pdo = new PDO('sqlite:' . $path, null, null, [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    $statement = $pdo->prepare($sql);
    $statement->execute($params);
    echo json_encode(['ok' => true, 'rows' => $statement->fetchAll()], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . "\n";
} catch (Throwable $e) {
    echo json_encode(['ok' => false, 'error' => $e->getMessage()]) . "\n";
    exit(1);
}
