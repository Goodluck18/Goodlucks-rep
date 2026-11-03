<?php
/**
 * Tiny SQLite inspection tool used by the migration regression tests.
 *
 * It only ever touches the database file it is pointed at, never the
 * application database, and it opens the file with PDO directly so that no
 * schema bootstrap happens behind the test's back.
 *
 * Usage:
 *   php tests/sqlite-tool.php --path=DB [--mode=exec-file --file=SCHEMA.sql]
 *   php tests/sqlite-tool.php --path=DB [--mode=exec  --sql="INSERT ..."]
 *   php tests/sqlite-tool.php --path=DB [--mode=tables]
 *   php tests/sqlite-tool.php --path=DB [--mode=columns --table=users]
 *   php tests/sqlite-tool.php --path=DB [--mode=query --sql="SELECT 1 AS x"]
 *   php tests/sqlite-tool.php --path=DB [--mode=indexes --table=fee_remittances]
 *
 * Output is a single JSON object on stdout; the exit code is 0 on success.
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

$path = arg('path');
$mode = arg('mode', 'tables');
if ($path === null || $path === '') {
    fwrite(STDERR, "Missing --path\n");
    exit(2);
}
if (!is_file($path)) {
    fwrite(STDERR, "Database file does not exist: {$path}\n");
    exit(2);
}

try {
    $pdo = new PDO('sqlite:' . $path, null, null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
} catch (Throwable $e) {
    fwrite(STDERR, 'Could not open ' . $path . ': ' . $e->getMessage() . "\n");
    exit(2);
}

$out = ['ok' => true, 'mode' => $mode];

try {
    switch ($mode) {
        case 'exec-file':
            $file = arg('file');
            if ($file === null || !is_file($file)) {
                throw new RuntimeException('Missing --file for exec-file');
            }
            $pdo->exec((string)file_get_contents($file));
            $out['executed'] = $file;
            break;

        case 'exec':
            $sql = (string)arg('sql', '');
            $out['rows'] = $pdo->exec($sql);
            break;

        case 'tables':
            $rows = $pdo->query("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
                ->fetchAll(PDO::FETCH_COLUMN);
            $out['tables'] = array_values(array_map('strval', $rows));
            break;

        case 'columns':
            $table = (string)arg('table', '');
            if (!preg_match('/^[A-Za-z_][A-Za-z0-9_]*$/', $table)) {
                throw new RuntimeException('Unsafe table name');
            }
            $rows = $pdo->query('PRAGMA table_info("' . $table . '")')->fetchAll();
            $out['columns'] = array_values(array_map(static fn($r) => (string)$r['name'], $rows));
            break;

        case 'indexes':
            $table = (string)arg('table', '');
            if (!preg_match('/^[A-Za-z_][A-Za-z0-9_]*$/', $table)) {
                throw new RuntimeException('Unsafe table name');
            }
            $stmt = $pdo->prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = :t ORDER BY name");
            $stmt->execute([':t' => $table]);
            $out['indexes'] = array_values(array_map('strval', $stmt->fetchAll(PDO::FETCH_COLUMN)));
            break;

        case 'query':
            $stmt = $pdo->query((string)arg('sql', ''));
            $out['rows'] = $stmt->fetchAll();
            break;

        default:
            throw new RuntimeException('Unknown mode: ' . $mode);
    }
} catch (Throwable $e) {
    $out = ['ok' => false, 'error' => $e->getMessage()];
    echo json_encode($out, JSON_UNESCAPED_SLASHES) . "\n";
    exit(1);
}

echo json_encode($out, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . "\n";
