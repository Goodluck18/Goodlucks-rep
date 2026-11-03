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

/**
 * Timestamp with microsecond precision (UTC), for append-only ordering.
 *
 * Two decisions recorded in the same second must still sort in the order the
 * reviewer made them, so the decision history stores microseconds. MySQL uses
 * DATETIME(6); SQLite stores the text as-is and sorts it lexicographically,
 * which is correct for this fixed-width format.
 */
function db_now_precise(): string
{
    $micro = (int)round(fmod(microtime(true), 1) * 1000000);
    if ($micro > 999999) {
        $micro = 999999;
    }
    return gmdate('Y-m-d H:i:s') . '.' . sprintf('%06d', $micro);
}

/** Timestamp $seconds in the future (UTC, DB format). */
function db_future(int $seconds): string
{
    return gmdate('Y-m-d H:i:s', time() + $seconds);
}

/**
 * Run a callback inside one database transaction.
 *
 * Used by financial writes that must never be half-applied (Increment E: a
 * policy snapshot and the ledger row it prices are written together). Nested
 * calls join the outer transaction instead of starting a second one, because
 * neither MySQL's InnoDB nor SQLite supports real nesting via PDO.
 *
 * This is the *deferred* form: on SQLite the write lock is taken by the first
 * write, which is fine for read-then-write sequences that do not need a
 * guarantee against another writer. Financial state machines use
 * `db_transaction_immediate()` instead.
 *
 * @template T
 * @param callable():T $callback
 * @return T
 */
function db_transaction(callable $callback)
{
    return db_tx_run($callback, false);
}

/**
 * Run a callback inside one transaction that holds the write lock from the
 * start. Use this for every financial state change.
 *
 * Why the two forms exist:
 *   - MySQL/InnoDB takes row locks at `SELECT ... FOR UPDATE` (see
 *     `db_lock_row()`), and `beginTransaction()` opens the transaction that
 *     holds them until commit.
 *   - SQLite has no row locks. Its `BEGIN DEFERRED` (what PDO uses) lets two
 *     writers both read, then one of them fails with `database is locked` when
 *     it tries to upgrade — or, worse, one silently overwrites the other's
 *     decision. `BEGIN IMMEDIATE` takes the write lock up front, so the second
 *     caller waits (busy_timeout is 5 s) and then sees the committed result.
 *
 * @template T
 * @param callable():T $callback
 * @return T
 */
function db_transaction_immediate(callable $callback)
{
    return db_tx_run($callback, true);
}

/**
 * Shared transaction runner. Depth lives in one global so the deferred and
 * immediate forms cannot accidentally nest inside each other.
 *
 * @template T
 * @param callable():T $callback
 * @return T
 */
function db_tx_run(callable $callback, bool $immediate)
{
    if (empty($GLOBALS['__goodlucks_tx_depth'])) {
        $GLOBALS['__goodlucks_tx_depth'] = 0;
    }
    if ($GLOBALS['__goodlucks_tx_depth'] > 0) {
        return $callback();
    }

    $pdo = db();
    $rawSqlite = db_driver() === 'sqlite';
    if ($rawSqlite) {
        // PDO's beginTransaction() issues BEGIN DEFERRED; we need IMMEDIATE for
        // the writer to be alone. Raw BEGIN/COMMIT is used from here on, so
        // PDO::inTransaction() is not consulted for SQLite.
        $pdo->exec($immediate ? 'BEGIN IMMEDIATE' : 'BEGIN');
    } else {
        $pdo->beginTransaction();
    }

    $GLOBALS['__goodlucks_tx_depth']++;
    db_tx_register_shutdown_guard();
    try {
        $result = $callback();
        if ($rawSqlite) {
            $pdo->exec('COMMIT');
        } else {
            $pdo->commit();
        }
        return $result;
    } catch (Throwable $e) {
        try {
            if ($rawSqlite) {
                $pdo->exec('ROLLBACK');
            } elseif ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
        } catch (Throwable $ignored) {
            // The transaction is already gone (for example the connection was
            // closed). Nothing to roll back; the original error is what matters.
        }
        throw $e;
    } finally {
        $GLOBALS['__goodlucks_tx_depth']--;
    }
}

/**
 * If a request dies mid-transaction (an `error_response()` call exits the
 * process), close the transaction cleanly instead of leaving it to the
 * connection teardown. Without this the rollback still happens — PDO rolls back
 * an open transaction when the connection closes — but doing it explicitly
 * makes "never leave a partial financial write" true on every path, including
 * the ones that end in an early exit.
 */
function db_tx_register_shutdown_guard(): void
{
    static $registered = false;
    if ($registered) {
        return;
    }
    $registered = true;
    register_shutdown_function('db_tx_shutdown_rollback');
}

function db_tx_shutdown_rollback(): void
{
    if (empty($GLOBALS['__goodlucks_tx_depth'])) {
        return;
    }
    try {
        $pdo = db();
        if (db_driver() === 'sqlite') {
            $pdo->exec('ROLLBACK');
        } elseif ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
    } catch (Throwable $ignored) {
        // Nothing left to roll back.
    }
    $GLOBALS['__goodlucks_tx_depth'] = 0;
}

/**
 * Read a row and hold a write lock on it for the rest of the transaction.
 *
 * MySQL/MariaDB: `SELECT ... FOR UPDATE` locks the row so a second request
 * blocks until this transaction commits, then re-reads the new state.
 * SQLite: there is no row lock; the `BEGIN IMMEDIATE` transaction that
 * `db_transaction_immediate()` opened already excludes other writers, so a
 * plain read is correct and `FOR UPDATE` is not valid syntax.
 *
 * MUST be called inside a transaction for the lock to mean anything.
 */
function db_lock_row(string $table, string $id, string $columns = '*'): ?array
{
    if (!preg_match('/^[a-z_][a-z0-9_]*$/', $table)) {
        throw new InvalidArgumentException('Unsafe table name for row lock.');
    }
    if (!preg_match('/^[a-zA-Z0-9_:*., ]+$/', $columns)) {
        throw new InvalidArgumentException('Unsafe column list for row lock.');
    }

    $sql = 'SELECT ' . $columns . ' FROM ' . $table . ' WHERE id = :id';
    if (db_driver() !== 'sqlite') {
        $sql .= ' FOR UPDATE';
    }

    return db_one($sql . ' LIMIT 1', [':id' => $id]);
}

/** True when the driver refused a write because another writer held the lock. */
function db_is_busy_error(Throwable $e): bool
{
    $message = strtolower($e->getMessage());
    return str_contains($message, 'database is locked')
        || str_contains($message, 'database table is locked')
        || str_contains($message, 'lock wait timeout')
        || str_contains($message, 'deadlock found');
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
