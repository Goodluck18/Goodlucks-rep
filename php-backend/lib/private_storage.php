<?php
/**
 * Goodlucks Homes - private document storage
 *
 * Identity documents (Ghana Card scans, passports, agent licences) are personal
 * data. They are stored outside the publicly served `uploads/` directory under
 * random server-generated names, and can only ever be read back through
 * `GET /api/verification-documents/{id}`, which checks the caller and writes an
 * audit row.
 *
 * Hardening in this file:
 *   - the client filename is never used, stored or echoed (no path traversal and
 *     no `x.php.jpg` games);
 *   - the extension comes from the detected MIME type, not the request;
 *   - the actual bytes are checked (PDF header, real image dimensions);
 *   - a per-file SHA-256 checksum is stored so a file can be matched to its row;
 *   - the directory carries its own deny-all .htaccess and the API root also
 *     refuses `storage/` (see php-backend/.htaccess);
 *   - reads re-resolve the real path and confirm it is inside the private store.
 */

declare(strict_types=1);

/**
 * MIME types accepted for private documents.
 *
 * Deliberately narrower than the public image uploader: no WEBP, no GIF, no SVG
 * and nothing that a browser could execute or inline as HTML.
 */
const PRIVATE_DOCUMENT_TYPES = [
    'application/pdf' => 'pdf',
    'image/jpeg'      => 'jpg',
    'image/png'       => 'png',
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
 * Verify the bytes really are one of the accepted document types.
 *
 * Returns the detected MIME type or throws. The extension in the metadata is
 * derived from this value, never from the upload.
 */
function private_document_detect_type(string $tmpPath): string
{
    $mime = (string)(new finfo(FILEINFO_MIME_TYPE))->file($tmpPath);
    if (!isset(PRIVATE_DOCUMENT_TYPES[$mime])) {
        throw new RuntimeException('Only PDF, JPG or PNG documents are allowed.');
    }

    if ($mime === 'application/pdf') {
        $handle = @fopen($tmpPath, 'rb');
        $header = $handle ? (string)fread($handle, 5) : '';
        if ($handle) {
            fclose($handle);
        }
        if ($header !== '%PDF-') {
            throw new RuntimeException('That file is not a valid PDF document.');
        }
    } else {
        $dimensions = @getimagesize($tmpPath);
        if ($dimensions === false || $dimensions[0] < 50 || $dimensions[1] < 50) {
            throw new RuntimeException('That file is not a valid image document.');
        }
    }

    return $mime;
}

/**
 * Move an uploaded identity document into private storage.
 *
 * @param array  $file    one entry from $_FILES
 * @param string $ownerId user id the document belongs to
 * @param string $kind    e.g. `document_front`, `licence`
 *
 * @return array{id: string, mimeType: string, bytes: int, checksum: string}
 */
function store_private_document(array $file, string $ownerId, string $kind): array
{
    $error = $file['error'] ?? UPLOAD_ERR_NO_FILE;
    if ($error !== UPLOAD_ERR_OK) {
        // PHP can reject a file before this code runs (upload_max_filesize /
        // post_max_size). Report that as a size problem, not a generic failure.
        if (in_array($error, [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true)) {
            throw new RuntimeException(
                'The document is too large. The limit is ' . round(IDENTITY_DOCUMENT_MAX_BYTES / 1048576) . ' MB.'
            );
        }
        throw new RuntimeException('The document failed to upload.');
    }
    $size = (int)($file['size'] ?? 0);
    if ($size <= 0 || $size > IDENTITY_DOCUMENT_MAX_BYTES) {
        throw new RuntimeException(
            'The document is too large. The limit is ' . round(IDENTITY_DOCUMENT_MAX_BYTES / 1048576) . ' MB.'
        );
    }
    if (!is_uploaded_file((string)($file['tmp_name'] ?? ''))) {
        throw new RuntimeException('Invalid upload.');
    }

    $mime = private_document_detect_type((string)$file['tmp_name']);

    $id = 'doc_' . bin2hex(random_bytes(12));
    $extension = PRIVATE_DOCUMENT_TYPES[$mime];
    $dir = private_storage_dir();
    $target = $dir . '/' . $id . '.' . $extension;

    if (!@move_uploaded_file((string)$file['tmp_name'], $target)) {
        gl_log('error', 'Could not move private document', ['target' => $target]);
        throw new RuntimeException('The server could not save the document.');
    }
    @chmod($target, 0600);

    $checksum = (string)hash_file('sha256', $target);

    $meta = [
        'id'        => $id,
        'ownerId'   => $ownerId,
        'kind'      => clean_string($kind, 64),
        'mimeType'  => $mime,
        'bytes'     => $size,
        'checksum'  => $checksum,
        'path'      => $target,
        'createdAt' => db_now(),
        // The original filename is intentionally not recorded.
    ];
    @file_put_contents(
        $dir . '/' . $id . '.json',
        json_encode($meta, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES),
        0600
    );

    audit_log('document.uploaded', 'document', $id, [
        'kind'     => $kind,
        'bytes'    => $size,
        'mimeType' => $mime,
        'checksum' => substr($checksum, 0, 16),
    ]);

    return ['id' => $id, 'mimeType' => $mime, 'bytes' => $size, 'checksum' => $checksum];
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

/**
 * Delete a stored private document (file + metadata sidecar).
 *
 * Used by owner deletion and the retention job. Missing files are not an error:
 * the row still gets its `deleted_at` marker.
 */
function remove_private_document(string $id): bool
{
    if (!preg_match('/^doc_[a-f0-9]{24}$/', $id)) {
        return false;
    }
    $dir = rtrim(PRIVATE_UPLOAD_DIR, '/');
    $removed = false;

    foreach (glob($dir . '/' . $id . '.*') ?: [] as $path) {
        $real = realpath($path);
        $root = realpath($dir);
        if ($real === false || $root === false || !str_starts_with($real, $root . DIRECTORY_SEPARATOR)) {
            continue;
        }
        if (@unlink($real)) {
            $removed = true;
        }
    }

    return $removed;
}

/** May this user download the document? Owner or authorised reviewer only. */
function user_can_read_private_document(array $user, array $meta): bool
{
    if ((string)($meta['ownerId'] ?? '') === (string)($user['id'] ?? '')) {
        return true;
    }

    return can_access_identity_documents($user);
}

/**
 * Stream a private document to an authenticated, authorised caller.
 *
 * Files are never web-reachable; every read passes through here and is logged.
 * Always served as a download with `nosniff`, so a mislabelled file cannot be
 * rendered as HTML or script in the reviewer's browser.
 */
function serve_private_document(string $id, array $user): void
{
    $meta = find_private_document($id);
    if (!$meta || !user_can_read_private_document($user, $meta)) {
        error_response('Document not found.', 404);
    }

    $mime = (string)($meta['mimeType'] ?? '');
    if (!isset(PRIVATE_DOCUMENT_TYPES[$mime])) {
        // A stored type outside the allowlist is treated as missing rather than
        // streamed with an unknown content type.
        error_response('Document not found.', 404);
    }

    $path = (string)($meta['path'] ?? '');
    $real = realpath($path);
    $root = realpath(rtrim(PRIVATE_UPLOAD_DIR, '/'));
    if ($real === false || $root === false || !str_starts_with($real, $root . DIRECTORY_SEPARATOR) || !is_file($real)) {
        error_response('Document not found.', 404);
    }

    audit_log('document.viewed', 'document', $id, [
        'kind'     => $meta['kind'] ?? '',
        'ownerId'  => $meta['ownerId'] ?? '',
        'byOwner'  => (string)($meta['ownerId'] ?? '') === (string)($user['id'] ?? ''),
    ]);

    if (ob_get_length()) {
        @ob_clean();
    }
    http_response_code(200);
    header('Content-Type: ' . $mime);
    header('Content-Length: ' . (string)filesize($real));
    header('Content-Disposition: attachment; filename="' . $id . '.' . PRIVATE_DOCUMENT_TYPES[$mime] . '"');
    header('Cache-Control: private, no-store');
    header('X-Content-Type-Options: nosniff');
    header('Content-Security-Policy: default-src \'none\'; sandbox');
    readfile($real);
    exit;
}
