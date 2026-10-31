<?php
/**
 * Goodlucks Homes - private document storage
 *
 * Identity documents (Ghana Card scans, proof of ownership, later agent
 * licences) are personal data. They are stored outside the public uploads
 * directory, under random names, and only ever streamed back through an
 * authenticated endpoint that checks ownership.
 *
 * No route is wired to these helpers yet: the platform does not accept
 * identity documents today. They exist so that when verification uploads are
 * added they cannot accidentally land in the publicly served `uploads/` folder.
 */

declare(strict_types=1);

/** MIME types accepted for private documents. */
const PRIVATE_DOCUMENT_TYPES = [
    'application/pdf' => 'pdf',
    'image/jpeg'      => 'jpg',
    'image/png'       => 'png',
    'image/webp'      => 'webp',
];

/** Absolute path of the private store, created on first use. */
function private_storage_dir(): string
{
    $dir = rtrim(PRIVATE_UPLOAD_DIR, '/');
    if (!is_dir($dir)) {
        @mkdir($dir, 0700, true);
    }

    // Defence in depth: even if the folder is reachable over HTTP by a
    // misconfigured server, deny access at the server level.
    $guard = $dir . '/.htaccess';
    if (!is_file($guard)) {
        @file_put_contents($guard, "Require all denied\nDeny from all\n");
    }

    return $dir;
}

/**
 * Move an uploaded identity document into private storage.
 *
 * @param array  $file    one entry from $_FILES
 * @param string $ownerId user id the document belongs to
 * @param string $kind    e.g. `ghana_card_front`, `proof_of_ownership`
 *
 * @return array{id: string, mimeType: string, bytes: int}
 */
function store_private_document(array $file, string $ownerId, string $kind): array
{
    if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        throw new RuntimeException('The document failed to upload.');
    }
    $size = (int)($file['size'] ?? 0);
    if ($size <= 0 || $size > UPLOAD_MAX_BYTES) {
        throw new RuntimeException('The document is too large.');
    }
    if (!is_uploaded_file((string)($file['tmp_name'] ?? ''))) {
        throw new RuntimeException('Invalid upload.');
    }

    $mime = (string)(new finfo(FILEINFO_MIME_TYPE))->file((string)$file['tmp_name']);
    if (!isset(PRIVATE_DOCUMENT_TYPES[$mime])) {
        throw new RuntimeException('Only PDF, JPG, PNG or WEBP documents are allowed.');
    }

    $id = 'doc_' . bin2hex(random_bytes(12));
    $extension = PRIVATE_DOCUMENT_TYPES[$mime];
    $dir = private_storage_dir();
    $target = $dir . '/' . $id . '.' . $extension;

    if (!@move_uploaded_file((string)$file['tmp_name'], $target)) {
        gl_log('error', 'Could not move private document', ['target' => $target]);
        throw new RuntimeException('The server could not save the document.');
    }
    @chmod($target, 0600);

    $meta = [
        'id'      => $id,
        'ownerId' => $ownerId,
        'kind'    => clean_string($kind, 64),
        'mimeType'=> $mime,
        'bytes'   => $size,
        'path'    => $target,
        'createdAt' => db_now(),
    ];
    @file_put_contents(
        $dir . '/' . $id . '.json',
        json_encode($meta, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES),
        0600
    );

    audit_log('document.uploaded', 'document', $id, ['kind' => $kind, 'bytes' => $size, 'mimeType' => $mime]);

    return ['id' => $id, 'mimeType' => $mime, 'bytes' => $size];
}

/** Metadata for a stored private document, or null. */
function find_private_document(string $id): ?array
{
    if (!preg_match('/^doc_[a-f0-9]{24}$/', $id)) {
        return null;
    }
    $metaPath = rtrim(PRIVATE_UPLOAD_DIR, '/') . '/' . $id . '.json';
    if (!is_file($metaPath)) {
        return null;
    }
    $meta = json_decode((string)@file_get_contents($metaPath), true);

    return is_array($meta) ? $meta : null;
}

/** May this user download the document? Owner or administrator only. */
function user_can_read_private_document(array $user, array $meta): bool
{
    if (($user['role'] ?? '') === 'admin') {
        return true;
    }

    return (string)($meta['ownerId'] ?? '') === (string)($user['id'] ?? '');
}

/**
 * Stream a private document to an authenticated, authorised caller.
 *
 * Files are never web-reachable; every read passes through here and is logged.
 */
function serve_private_document(string $id, array $user): void
{
    $meta = find_private_document($id);
    if (!$meta || !user_can_read_private_document($user, $meta)) {
        error_response('Document not found.', 404);
    }

    $path = (string)($meta['path'] ?? '');
    $real = realpath($path);
    $root = realpath(rtrim(PRIVATE_UPLOAD_DIR, '/'));
    if ($real === false || $root === false || !str_starts_with($real, $root . DIRECTORY_SEPARATOR) || !is_file($real)) {
        error_response('Document not found.', 404);
    }

    audit_log('document.viewed', 'document', $id, ['kind' => $meta['kind'] ?? '']);

    if (ob_get_length()) {
        @ob_clean();
    }
    http_response_code(200);
    header('Content-Type: ' . (string)($meta['mimeType'] ?? 'application/octet-stream'));
    header('Content-Length: ' . (string)filesize($real));
    header('Content-Disposition: attachment; filename="' . $id . '"');
    header('Cache-Control: private, no-store');
    header('X-Content-Type-Options: nosniff');
    readfile($real);
    exit;
}
