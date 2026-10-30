<?php
/**
 * Goodlucks Homes - Database connection layer
 *
 * Supports MySQL (production / cPanel) and SQLite (local development + tests).
 * All queries in the application use PDO prepared statements with bound
 * parameters, so the same SQL works on both drivers.
 */

declare(strict_types=1);

function db_driver(): string
{
    return DB_DRIVER === 'sqlite' ? 'sqlite' : 'mysql';
}

/**
 * Shared PDO connection.
 *
 * @throws PDOException when the configured database is unreachable.
 */
function db(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $options = [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
    ];

    if (db_driver() === 'sqlite') {
        $path = DB_SQLITE_PATH;
        $dir = dirname($path);
        if (!is_dir($dir)) {
            @mkdir($dir, 0755, true);
        }
        $isNew = !is_file($path) || filesize($path) === 0;
        $pdo = new PDO('sqlite:' . $path, null, null, $options);
        $pdo->exec('PRAGMA foreign_keys = ON');
        $pdo->exec('PRAGMA journal_mode = WAL');
        $pdo->exec('PRAGMA busy_timeout = 5000');
        if ($isNew) {
            initialize_sqlite_schema($pdo);
        }
        return $pdo;
    }

    if (DB_NAME === '' || DB_USER === '') {
        gl_log('error', 'Database not configured: DB_NAME/DB_USER are empty.');
        throw new PDOException('Database is not configured.');
    }

    $dsn = 'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=' . DB_CHARSET;
    $pdo = new PDO($dsn, DB_USER, DB_PASS, $options);
    return $pdo;
}

/**
 * Create + seed the local SQLite database from schema.sqlite.sql.
 * Only ever used for DB_DRIVER=sqlite (development / automated tests).
 */
function initialize_sqlite_schema(PDO $pdo): void
{
    $schemaFile = DB_SQLITE_SCHEMA;
    if (!is_file($schemaFile)) {
        throw new PDOException('SQLite schema file not found: ' . $schemaFile);
    }
    $sql = (string)file_get_contents($schemaFile);
    if (trim($sql) === '') {
        throw new PDOException('SQLite schema file is empty: ' . $schemaFile);
    }
    $pdo->exec($sql);
    gl_log('info', 'Initialized local SQLite database', ['path' => DB_SQLITE_PATH]);
}

/** Current timestamp in the format used by every table (UTC). */
function db_now(): string
{
    return gmdate('Y-m-d H:i:s');
}

/** Timestamp $seconds in the future (UTC, DB format). */
function db_future(int $seconds): string
{
    return gmdate('Y-m-d H:i:s', time() + $seconds);
}

function db_is_unique_violation(Throwable $e): bool
{
    if (!($e instanceof PDOException)) {
        return false;
    }
    $code = (string)($e->getCode() ?? '');
    $message = strtolower($e->getMessage());
    return $code === '23000'
        || str_contains($message, 'unique constraint')
        || str_contains($message, 'duplicate entry');
}

/**
 * Run a SELECT and return all rows.
 */
function db_all(string $sql, array $params = []): array
{
    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    return $stmt->fetchAll();
}

/**
 * Run a SELECT and return the first row (or null).
 */
function db_one(string $sql, array $params = []): ?array
{
    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    $row = $stmt->fetch();
    return $row === false ? null : $row;
}

/**
 * Run a SELECT and return the first column of the first row.
 */
function db_value(string $sql, array $params = [])
{
    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    $value = $stmt->fetchColumn();
    return $value === false ? null : $value;
}

/**
 * Run an INSERT/UPDATE/DELETE. Returns the number of affected rows.
 */
function db_exec(string $sql, array $params = []): int
{
    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    return $stmt->rowCount();
}

/** Generate a short, URL-safe, collision-resistant identifier. */
function new_id(string $prefix): string
{
    return $prefix . '-' . bin2hex(random_bytes(8));
}

/**
 * Portable LIMIT/OFFSET clause with integer-cast values (never interpolate
 * user input into SQL as a string).
 */
function db_limit_clause(int $limit, int $offset): string
{
    return ' LIMIT ' . max(0, $limit) . ' OFFSET ' . max(0, $offset);
}

/** Decode a JSON column into a PHP array, always returning an array. */
function json_column($value): array
{
    if (is_array($value)) {
        return $value;
    }
    if (!is_string($value) || trim($value) === '') {
        return [];
    }
    $decoded = json_decode($value, true);
    return is_array($decoded) ? $decoded : [];
}
