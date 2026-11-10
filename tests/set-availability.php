<?php
/**
 * Test helper: move a listing's availability clock, or read it back.
 *
 * The seven-day rule is time-based, and a test cannot wait seven days, so this
 * fixture edits the stored timestamps directly. It writes only the three
 * availability columns (and optionally the property status) — never a
 * notification, never a history row — so the code under test still has to do the
 * real work.
 *
 *   php tests/set-availability.php --property=prop-1 --due-in-days=3
 *   php tests/set-availability.php --property=prop-1 --due-in-seconds=-60
 *   php tests/set-availability.php --property=prop-1 --status=active --due-in-days=0
 *   php tests/set-availability.php --property=prop-1 --show
 *   php tests/set-availability.php --property=prop-1 --cron            # run the job
 */

require_once __DIR__ . '/../php-backend/config.php';

$options = getopt('', [
    'property:', 'due-in-days::', 'due-in-seconds::', 'due-at::',
    'confirmed-at::', 'published-at::', 'status::', 'show', 'cron', 'events',
    'notifications::', 'email-count::',
]);

$propertyId = (string)($options['property'] ?? '');
if ($propertyId === '') {
    fwrite(STDERR, "Usage: php tests/set-availability.php --property=<id> [--due-in-days=N] [--status=active] [--show] [--cron]\n");
    exit(2);
}

$row = find_property($propertyId);
if ($row === null) {
    fwrite(STDERR, "No property with that id\n");
    exit(3);
}

$out = [];

if (array_key_exists('due-in-days', $options)) {
    $timestamp = time() + ((float)$options['due-in-days']) * 86400;
    update_property($propertyId, ['availability_due_at' => gmdate('Y-m-d H:i:s', (int)$timestamp)]);
    $out['dueAt'] = gmdate('Y-m-d H:i:s', (int)$timestamp);
}
if (array_key_exists('due-in-seconds', $options)) {
    $timestamp = time() + (int)$options['due-in-seconds'];
    update_property($propertyId, ['availability_due_at' => gmdate('Y-m-d H:i:s', $timestamp)]);
    $out['dueAt'] = gmdate('Y-m-d H:i:s', $timestamp);
}
if (array_key_exists('due-at', $options) && (string)$options['due-at'] !== '') {
    update_property($propertyId, ['availability_due_at' => (string)$options['due-at']]);
}
if (array_key_exists('confirmed-at', $options) && (string)$options['confirmed-at'] !== '') {
    update_property($propertyId, ['availability_confirmed_at' => (string)$options['confirmed-at']]);
}
if (array_key_exists('published-at', $options) && (string)$options['published-at'] !== '') {
    update_property($propertyId, ['published_at' => (string)$options['published-at']]);
}
if (array_key_exists('status', $options) && (string)$options['status'] !== '') {
    db_exec('UPDATE properties SET status = :status, updated_at = :updated WHERE id = :id', [
        ':status'  => (string)$options['status'],
        ':updated' => db_now(),
        ':id'      => $propertyId,
    ]);
    $out['status'] = (string)$options['status'];
}

if (array_key_exists('cron', $options)) {
    $out['cron'] = run_property_availability_maintenance(false);
}

$row = find_property($propertyId);

$out['property'] = [
    'id'                        => (string)$row['id'],
    'status'                    => (string)$row['status'],
    'publishedAt'               => (string)($row['published_at'] ?? ''),
    'availabilityConfirmedAt'   => (string)($row['availability_confirmed_at'] ?? ''),
    'availabilityDueAt'         => (string)($row['availability_due_at'] ?? ''),
    'state'                     => property_availability_state($row)['state'],
    'public'                    => property_is_publicly_visible($row),
];

if (array_key_exists('events', $options)) {
    $out['events'] = array_map(
        static fn(array $row): array => [
            'action'    => (string)$row['action'],
            'actorRole' => (string)$row['actor_role'],
            'source'    => (string)$row['source'],
            'cycleKey'  => (string)$row['cycle_key'],
            'createdAt' => (string)$row['created_at'],
        ],
        db_all('SELECT * FROM property_availability_events WHERE property_id = :id ORDER BY created_at ASC', [':id' => $propertyId])
    );
}

// Notification and email counts, so a suite can prove nothing is duplicated.
if (array_key_exists('notifications', $options) && (string)$options['notifications'] !== '') {
    $rows = db_all(
        'SELECT title, message, type, created_at FROM notifications WHERE user_id = :id ORDER BY created_at ASC',
        [':id' => (string)$options['notifications']]
    );
    $out['notifications'] = array_map(static fn(array $row): array => [
        'title'     => (string)$row['title'],
        'message'   => (string)$row['message'],
        'type'      => (string)$row['type'],
        'createdAt' => (string)$row['created_at'],
    ], $rows);
}

if (array_key_exists('email-count', $options) && (string)$options['email-count'] !== '') {
    $out['emailCount'] = (int)db_value(
        'SELECT COUNT(*) FROM email_logs WHERE LOWER(recipient_email) = :email',
        [':email' => strtolower((string)$options['email-count'])]
    );
}

echo json_encode($out, JSON_UNESCAPED_SLASHES) . "\n";
