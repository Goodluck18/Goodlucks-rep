<?php
/**
 * Test-only fixtures for the Blog & Learning Centre (Task 07).
 *
 * Two things the suite cannot do through the API on purpose:
 *
 *  1. Make a scheduled article's publication time arrive. Nothing in the
 *     application can publish a scheduled article early — that is the rule being
 *     tested — so the fixture moves `publish_at` into the past and lets the
 *     normal promotion path do the rest.
 *  2. Read the HTML that was actually queued in the outbox. The API only exposes
 *     the email log (subject, type, status), which is right for the console but
 *     not enough to prove that an email template's paragraph was appended.
 *
 * Nothing in application code calls this script.
 *
 *   php tests/blog-fixtures.php --publish-at-past=<slug>
 *   php tests/blog-fixtures.php --outbox=<n>
 *   php tests/blog-fixtures.php --count-posts=<status>
 */

require_once __DIR__ . '/../php-backend/config.php';

$options = getopt('', ['publish-at-past::', 'outbox::', 'count-posts::', 'post-status::']);

$out = ['ok' => true];

if (($options['publish-at-past'] ?? '') !== '') {
    $slug = (string)$options['publish-at-past'];
    $row = db_one('SELECT * FROM blog_posts WHERE slug = :slug', [':slug' => $slug]);
    if ($row === null) {
        fwrite(STDERR, "No article with slug {$slug}\n");
        exit(3);
    }
    $past = gmdate('Y-m-d H:i:s', time() - 60);
    db_exec('UPDATE blog_posts SET publish_at = :at WHERE id = :id', [':at' => $past, ':id' => (string)$row['id']]);
    $out['postId'] = (string)$row['id'];
    $out['publishAt'] = $past;
}

if (($options['post-status'] ?? '') !== '') {
    $slug = (string)$options['publish-at-past'];
    $row = $slug !== '' ? db_one('SELECT * FROM blog_posts WHERE slug = :slug', [':slug' => $slug]) : null;
    if ($row === null) {
        fwrite(STDERR, "No article to inspect\n");
        exit(3);
    }
    $out['status'] = (string)$row['status'];
}

if (($options['count-posts'] ?? '') !== '') {
    $status = (string)$options['count-posts'];
    $out['count'] = $status === '*'
        ? (int)db_value('SELECT COUNT(*) FROM blog_posts')
        : (int)db_value('SELECT COUNT(*) FROM blog_posts WHERE status = :status', [':status' => $status]);
}

if (($options['outbox'] ?? '') !== '') {
    $limit = max(1, (int)$options['outbox']);
    $rows = db_all(
        'SELECT type, subject, body_html, status FROM email_outbox ORDER BY created_at DESC, rowid DESC LIMIT ' . $limit,
        []
    );
    // Newest first; the caller usually wants the most recent message only.
    $out['messages'] = array_map(static fn($row) => [
        'type'    => (string)$row['type'],
        'subject' => (string)$row['subject'],
        'body'    => (string)$row['body_html'],
        'status'  => (string)$row['status'],
    ], $rows);
}

echo json_encode($out) . "\n";
