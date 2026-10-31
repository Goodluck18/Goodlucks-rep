<?php
/**
 * Goodlucks Homes - audit trail
 *
 * Append-only record of sensitive actions: moderation decisions, verification
 * changes, financial records and every access to protected personal data.
 *
 * Rules:
 *   - writing an audit row must never break the action being audited;
 *   - secrets and identity numbers are redacted before they are stored;
 *   - only administrators can read the trail back (GET /api/admin/audit-logs).
 */

declare(strict_types=1);

/** Keys whose values are never written to the audit trail in full. */
const AUDIT_REDACTED_KEYS = [
    'password',
    'password_hash',
    'new_password',
    'token',
    'token_hash',
    'secret',
    'api_key',
    'landlord_ghana_card',
    'tenant_ghana_card',
    'landlordghancard',
    'tenantghanacard',
    'landlordGhanaCard',
    'tenantGhanaCard',
    'ghana_card',
    'ghanaCard',
    'card_number',
];

/** Mask a value, keeping only the last four characters. */
function audit_mask_value(string $value): string
{
    $value = trim($value);
    if ($value === '') {
        return '';
    }
    if (strlen($value) <= 4) {
        return '****';
    }
    return '****' . substr($value, -4);
}

/**
 * Recursively redact sensitive keys and truncate long strings.
 */
function audit_redact($value, int $depth = 0)
{
    if ($depth > 4) {
        return '[truncated]';
    }
    if (is_array($value)) {
        $clean = [];
        foreach ($value as $key => $item) {
            $keyString = (string)$key;
            if (in_array($keyString, AUDIT_REDACTED_KEYS, true)
                || in_array(strtolower($keyString), array_map('strtolower', AUDIT_REDACTED_KEYS), true)
            ) {
                $clean[$key] = is_scalar($item) ? audit_mask_value((string)$item) : '[redacted]';
                continue;
            }
            $clean[$key] = audit_redact($item, $depth + 1);
        }
        return $clean;
    }
    if (is_bool($value) || $value === null || is_int($value) || is_float($value)) {
        return $value;
    }
    if (is_string($value)) {
        return mb_substr($value, 0, 500);
    }
    return '[value]';
}

/**
 * Record a sensitive action.
 *
 * @param string     $action     dotted verb, e.g. `agreement.signed`
 * @param string     $entityType `agreement`, `receipt`, `property`, ...
 * @param string     $entityId   id of the affected record
 * @param array      $context    extra detail (redacted before storage)
 * @param array|null $actor      defaults to the signed-in user
 */
function audit_log(
    string $action,
    string $entityType,
    string $entityId,
    array $context = [],
    ?array $actor = null
): void {
    try {
        $actor = $actor ?? auth_user();
        $context['ip'] = client_ip();
        $context['user_agent'] = substr((string)($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 255);

        db_exec(
            'INSERT INTO audit_logs
                (id, actor_id, actor_role, action, entity_type, entity_id, context_json, ip_address, user_agent, created_at)
             VALUES
                (:id, :actor_id, :actor_role, :action, :entity_type, :entity_id, :context, :ip, :ua, :created)',
            [
                ':id'          => new_id('audit'),
                ':actor_id'    => $actor['id'] ?? null,
                ':actor_role'  => $actor['role'] ?? null,
                ':action'      => clean_string($action, 64),
                ':entity_type' => clean_string($entityType, 64),
                ':entity_id'   => clean_string($entityId, 64),
                ':context'     => json_encode(audit_redact($context), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
                ':ip'          => substr(client_ip(), 0, 64),
                ':ua'          => substr((string)($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 255),
                ':created'     => db_now(),
            ]
        );
    } catch (Throwable $e) {
        // Auditing is important but must never take a request down with it.
        gl_log('error', 'Could not write audit log: ' . $e->getMessage(), ['action' => $action]);
    }
}

/** Public shape of an audit row. */
function shape_audit_log(array $row): array
{
    $context = json_column($row['context_json'] ?? null);

    return [
        'id'         => (string)$row['id'],
        'actorId'    => (string)($row['actor_id'] ?? ''),
        'actorRole'  => (string)($row['actor_role'] ?? ''),
        'action'     => (string)$row['action'],
        'entityType' => (string)$row['entity_type'],
        'entityId'   => (string)($row['entity_id'] ?? ''),
        'context'    => $context,
        'ipAddress'  => (string)($row['ip_address'] ?? ''),
        'createdAt'  => to_iso($row['created_at'] ?? null),
    ];
}

/**
 * Read the trail. Admin-only at the route level.
 *
 * @param array{entityType?: string, entityId?: string, action?: string, actorId?: string} $filters
 */
function list_audit_logs(array $filters = [], int $limit = 200): array
{
    $where = [];
    $params = [];

    if (!empty($filters['entityType'])) {
        $where[] = 'entity_type = :entity_type';
        $params[':entity_type'] = (string)$filters['entityType'];
    }
    if (!empty($filters['entityId'])) {
        $where[] = 'entity_id = :entity_id';
        $params[':entity_id'] = (string)$filters['entityId'];
    }
    if (!empty($filters['action'])) {
        $where[] = 'action = :action';
        $params[':action'] = (string)$filters['action'];
    }
    if (!empty($filters['actorId'])) {
        $where[] = 'actor_id = :actor_id';
        $params[':actor_id'] = (string)$filters['actorId'];
    }

    $sql = 'SELECT * FROM audit_logs'
        . ($where ? ' WHERE ' . implode(' AND ', $where) : '')
        . ' ORDER BY created_at DESC' . db_limit_clause(max(1, $limit), 0);

    return array_map('shape_audit_log', db_all($sql, $params));
}
