<?php
/**
 * Goodlucks Homes — legal documents (Terms & Conditions, Privacy Policy), their
 * published versions and the acceptance records attached to an account.
 *
 * Why this file exists
 * --------------------
 * The Terms and Privacy Policy are content, not source code. An administrator
 * edits them in the console; the public pages read the CURRENT PUBLISHED version
 * from the database. Changing the wording therefore never needs a code change or
 * a deployment, and a draft saved at 11pm is never served to a visitor.
 *
 * The rules this file protects
 * ----------------------------
 *   * Drafts are never public. Only a version referenced by
 *     `legal_documents.current_version_id` is served by the public endpoint.
 *   * History is append-only. Publishing adds a version and marks the previous
 *     one `superseded`; restoring adds ANOTHER version copying an older one. No
 *     published row is ever rewritten or deleted.
 *   * Publishing is atomic. The previous version is only superseded once the new
 *     one is written, inside one transaction. A failure leaves the live document
 *     exactly as it was.
 *   * Content is sanitised before it is stored or rendered, with the same
 *     allow-list sanitiser the blog uses (headings, paragraphs, emphasis, lists,
 *     links). No media, no scripts, no iframes, no inline styles.
 *   * Acceptance is recorded per account, per document and per version, with the
 *     time. Terms acceptance and the Privacy acknowledgement are two separate
 *     records. An existing account is never silently marked as having accepted
 *     anything.
 *   * Every administrative action is written to the audit log.
 */

declare(strict_types=1);

const LEGAL_DOCUMENT_TABLE    = 'legal_documents';
const LEGAL_VERSION_TABLE     = 'legal_document_versions';
const LEGAL_ACCEPTANCE_TABLE  = 'legal_acceptances';

const LEGAL_STATUS_DRAFT      = 'draft';
const LEGAL_STATUS_PUBLISHED  = 'published';
const LEGAL_STATUS_SUPERSEDED = 'superseded';

/** A generous ceiling; a legal document is long, but not unbounded. */
const LEGAL_MAX_CONTENT_BYTES = 400000;

/** Key in `platform_settings` that switches on the re-acceptance prompt. */
const LEGAL_REACCEPTANCE_SETTING = 'legal_terms_reacceptance';

// ---------------------------------------------------------------------------
// Capabilities (default deny; granted only from the server console)
// ---------------------------------------------------------------------------

/** May this administrator open the Legal Pages console and save drafts? */
function can_manage_legal(?array $user = null): bool
{
    $user = $user ?? auth_user();
    if ($user === null || (string)($user['role'] ?? '') !== 'admin') {
        return false;
    }
    if (is_primary_admin($user)) {
        return true;
    }

    return (int)($user['can_manage_legal'] ?? 0) === 1;
}

/**
 * May this administrator publish? Deliberately not implied by the editing
 * capability: writing a draft is not the power to make it the public policy.
 */
function can_publish_legal(?array $user = null): bool
{
    $user = $user ?? auth_user();
    if ($user === null || (string)($user['role'] ?? '') !== 'admin') {
        return false;
    }
    if (is_primary_admin($user)) {
        return true;
    }

    return (int)($user['can_publish_legal'] ?? 0) === 1;
}

/** The console hint for the two legal capabilities. Endpoints re-check. */
function legal_capabilities(array $user): array
{
    return [
        'manageLegal'  => can_manage_legal($user),
        'publishLegal' => can_publish_legal($user),
    ];
}

function require_legal_manage(): array
{
    $user = require_auth(['admin']);
    if (!can_manage_legal($user)) {
        error_response(
            'Editing the legal documents requires the legal-pages capability. Ask a server administrator to grant it.',
            403
        );
    }

    return $user;
}

function require_legal_publish(): array
{
    $user = require_auth(['admin']);
    if (!can_publish_legal($user)) {
        error_response(
            'Publishing a legal document requires the legal-publish capability. Editing a draft does not grant it.',
            403
        );
    }

    return $user;
}

// ---------------------------------------------------------------------------
// Documents & versions
// ---------------------------------------------------------------------------

/** Is this a document type this build knows about? */
function legal_is_type(string $type): bool
{
    return in_array($type, LEGAL_DOCUMENT_TYPES, true);
}

/** Map a public slug (`terms-and-conditions`) to its document type. */
function legal_type_for_slug(string $slug): ?string
{
    foreach (legal_document_labels() as $type => $labels) {
        if ($labels['slug'] === $slug) {
            return $type;
        }
    }

    return null;
}

/** The stored document row, without seeding. */
function legal_document_row(string $type): ?array
{
    if (!legal_is_type($type)) {
        return null;
    }

    return db_one(
        'SELECT * FROM ' . LEGAL_DOCUMENT_TABLE . ' WHERE document_type = :type LIMIT 1',
        [':type' => $type]
    );
}

/**
 * Make sure both documents exist, with one published first version.
 *
 * Idempotent and safe to call on every request: after the first run it is one
 * cheap COUNT. It never touches an existing published version, so an
 * administrator's edits are never overwritten by a later boot.
 *
 * Called before serving a public page (so a fresh installation is never empty)
 * and before validating a registration (so consent always names a real version).
 */
function legal_ensure_documents(): void
{
    static $done = false;
    if ($done) {
        return;
    }

    $existing = (int)db_value('SELECT COUNT(*) FROM ' . LEGAL_DOCUMENT_TABLE);
    if ($existing < count(LEGAL_DOCUMENT_TYPES)) {
        db_transaction_immediate(function (): void {
            $now = db_now();
            foreach (LEGAL_DOCUMENT_TYPES as $type) {
                if (legal_document_row($type) !== null) {
                    continue;
                }
                $seed = legal_seed_document($type);
                $documentId = new_id('legal');
                try {
                    db_exec(
                        'INSERT INTO ' . LEGAL_DOCUMENT_TABLE . '
                            (id, document_type, slug, title, summary, current_version_id, created_at, updated_at)
                         VALUES (:id, :type, :slug, :title, :summary, NULL, :now, :now)',
                        [
                            ':id'      => $documentId,
                            ':type'    => $type,
                            ':slug'    => $seed['slug'],
                            ':title'   => $seed['title'],
                            ':summary' => $seed['summary'],
                            ':now'     => $now,
                        ]
                    );
                } catch (Throwable $e) {
                    if (db_is_unique_violation($e)) {
                        continue; // another request seeded it first
                    }
                    throw $e;
                }

                $versionId = new_id('legalv');
                db_exec(
                    'INSERT INTO ' . LEGAL_VERSION_TABLE . '
                        (id, document_id, version_number, status, title, content_html, change_note,
                         effective_at, created_by, created_by_name, created_at, updated_at,
                         published_at, published_by, published_by_name, restored_from_version)
                     VALUES (:id, :doc, 1, :status, :title, :content, :note,
                             :effective, NULL, :author, :now, :now,
                             :published, NULL, :author, NULL)',
                    [
                        ':id'        => $versionId,
                        ':doc'       => $documentId,
                        ':status'    => LEGAL_STATUS_PUBLISHED,
                        ':title'     => $seed['title'],
                        ':content'   => blog_sanitize_html($seed['content'], ['allow_media' => false]),
                        ':note'      => $seed['change_note'],
                        ':effective' => $now,
                        ':author'    => 'Goodlucks Homes',
                        ':now'       => $now,
                        ':published' => $now,
                    ]
                );
                db_exec(
                    'UPDATE ' . LEGAL_DOCUMENT_TABLE . '
                        SET current_version_id = :version, updated_at = :now
                      WHERE id = :id',
                    [':version' => $versionId, ':now' => $now, ':id' => $documentId]
                );
            }
        });
    }

    $done = true;
}

/** The document row, seeding the defaults first if the table is empty. */
function legal_document(string $type): ?array
{
    if (!legal_is_type($type)) {
        return null;
    }
    $row = legal_document_row($type);
    if ($row === null) {
        legal_ensure_documents();
        $row = legal_document_row($type);
    }

    return $row;
}

/**
 * The version the public page serves — and the only version it can serve.
 *
 * The document's `current_version_id` must point at a row whose status is
 * `published`; a draft that somehow became the pointer is still not served.
 */
function legal_current_published(string $type): ?array
{
    $document = legal_document($type);
    if ($document === null) {
        return null;
    }
    $versionId = (string)($document['current_version_id'] ?? '');
    if ($versionId === '') {
        return null;
    }

    $row = db_one(
        'SELECT * FROM ' . LEGAL_VERSION_TABLE . '
          WHERE id = :id AND document_id = :doc AND status = :status LIMIT 1',
        [':id' => $versionId, ':doc' => (string)$document['id'], ':status' => LEGAL_STATUS_PUBLISHED]
    );

    return $row;
}

/** The editable draft for a document, if one exists. */
function legal_draft_for(string $documentId): ?array
{
    return db_one(
        'SELECT * FROM ' . LEGAL_VERSION_TABLE . '
          WHERE document_id = :doc AND status = :status
          ORDER BY version_number DESC LIMIT 1',
        [':doc' => $documentId, ':status' => LEGAL_STATUS_DRAFT]
    );
}

/** Every version of a document, newest first, drafts included (admin only). */
function legal_versions_for(string $documentId): array
{
    return db_all(
        'SELECT * FROM ' . LEGAL_VERSION_TABLE . '
          WHERE document_id = :doc
          ORDER BY version_number DESC',
        [':doc' => $documentId]
    );
}

/** One version row of a document. */
function legal_version_row(string $documentId, int $versionNumber): ?array
{
    return db_one(
        'SELECT * FROM ' . LEGAL_VERSION_TABLE . '
          WHERE document_id = :doc AND version_number = :number LIMIT 1',
        [':doc' => $documentId, ':number' => $versionNumber]
    );
}

function legal_next_version_number(string $documentId): int
{
    $max = (int)db_value(
        'SELECT MAX(version_number) FROM ' . LEGAL_VERSION_TABLE . ' WHERE document_id = :doc',
        [':doc' => $documentId]
    );

    return $max + 1;
}

/** A stored version, shaped for the client. Content is opt-in. */
function legal_shape_version(array $row, bool $withContent = false): array
{
    $shape = [
        'id'                  => (string)$row['id'],
        'version'             => (int)$row['version_number'],
        'status'              => (string)$row['status'],
        'title'               => (string)$row['title'],
        'changeNote'          => (string)($row['change_note'] ?? ''),
        'effectiveAt'         => to_iso($row['effective_at'] ?? null),
        'createdAt'           => to_iso($row['created_at'] ?? null),
        'createdByName'       => (string)($row['created_by_name'] ?? ''),
        'publishedAt'         => to_iso($row['published_at'] ?? null),
        'publishedByName'     => (string)($row['published_by_name'] ?? ''),
        'restoredFromVersion' => isset($row['restored_from_version']) && $row['restored_from_version'] !== null
            ? (int)$row['restored_from_version']
            : null,
    ];
    if ($withContent) {
        $shape['contentHtml'] = (string)($row['content_html'] ?? '');
    }

    return $shape;
}

// ---------------------------------------------------------------------------
// Public API shapes
// ---------------------------------------------------------------------------

/** Everything a visitor's page needs. Never includes a draft. */
function legal_public_document(string $type): ?array
{
    $document = legal_document($type);
    $version = legal_current_published($type);
    if ($document === null || $version === null) {
        return null;
    }

    return [
        'type'      => (string)$document['document_type'],
        'slug'      => (string)$document['slug'],
        'title'     => (string)$document['title'],
        'summary'   => (string)($document['summary'] ?? ''),
        'version'   => (int)$version['version_number'],
        'effectiveAt' => to_iso($version['effective_at'] ?? null),
        'publishedAt' => to_iso($version['published_at'] ?? null),
        'updatedAt'   => to_iso($document['updated_at'] ?? $version['published_at'] ?? null),
        'contentHtml' => (string)$version['content_html'],
    ];
}

/** The two documents' identity and version, without their bodies. */
function legal_public_index(): array
{
    $documents = [];
    foreach (LEGAL_DOCUMENT_TYPES as $type) {
        $document = legal_document($type);
        $version = legal_current_published($type);
        if ($document === null || $version === null) {
            continue;
        }
        $documents[] = [
            'type'        => (string)$document['document_type'],
            'slug'        => (string)$document['slug'],
            'title'       => (string)$document['title'],
            'summary'     => (string)($document['summary'] ?? ''),
            'version'     => (int)$version['version_number'],
            'effectiveAt' => to_iso($version['effective_at'] ?? null),
            'updatedAt'   => to_iso($document['updated_at'] ?? null),
        ];
    }

    return $documents;
}

// ---------------------------------------------------------------------------
// Editing, publishing, restoring
// ---------------------------------------------------------------------------

/** Sanitise and validate an administrator's draft body. Throws on refusal. */
function legal_clean_content(string $html): string
{
    $clean = blog_sanitize_html($html, ['allow_media' => false]);
    $text = trim(preg_replace('/\s+/u', ' ', strip_tags($clean)) ?? '');
    if ($text === '') {
        throw new InvalidArgumentException('The document cannot be empty.');
    }
    if (strlen($clean) > LEGAL_MAX_CONTENT_BYTES) {
        throw new InvalidArgumentException('The document is too long.');
    }
    if (stripos($clean, '<h2') === false) {
        throw new InvalidArgumentException('Add at least one numbered section heading (H2) so the document can be read and navigated.');
    }

    return $clean;
}

/**
 * Save (create or replace) the single draft of a document.
 *
 * Only the draft row is touched. The published version is neither read nor
 * written here, so saving a draft can never change what the public sees.
 */
function legal_save_draft(string $type, string $contentHtml, ?array $actor, string $title = ''): array
{
    $document = legal_document($type);
    if ($document === null) {
        throw new InvalidArgumentException('Unknown legal document.');
    }
    $clean = legal_clean_content($contentHtml);
    $actor = $actor ?? auth_user();
    $now = db_now();
    $documentId = (string)$document['id'];
    $documentTitle = trim($title) !== '' ? trim($title) : (string)$document['title'];

    $draft = legal_draft_for($documentId);
    if ($draft !== null) {
        db_exec(
            'UPDATE ' . LEGAL_VERSION_TABLE . '
                SET content_html = :content, title = :title, updated_at = :now
              WHERE id = :id AND status = :status',
            [
                ':content' => $clean,
                ':title'   => $documentTitle,
                ':now'     => $now,
                ':id'      => (string)$draft['id'],
                ':status'  => LEGAL_STATUS_DRAFT,
            ]
        );
        $saved = legal_draft_for($documentId);
    } else {
        $versionNumber = legal_next_version_number($documentId);
        $id = new_id('legalv');
        db_exec(
            'INSERT INTO ' . LEGAL_VERSION_TABLE . '
                (id, document_id, version_number, status, title, content_html, change_note,
                 effective_at, created_by, created_by_name, created_at, updated_at,
                 published_at, published_by, published_by_name, restored_from_version)
             VALUES (:id, :doc, :number, :status, :title, :content, \'\',
                     NULL, :by, :by_name, :now, :now, NULL, NULL, \'\', NULL)',
            [
                ':id'      => $id,
                ':doc'     => $documentId,
                ':number'  => $versionNumber,
                ':status'  => LEGAL_STATUS_DRAFT,
                ':title'   => $documentTitle,
                ':content' => $clean,
                ':by'      => (string)($actor['id'] ?? ''),
                ':by_name' => (string)($actor['name'] ?? ''),
                ':now'     => $now,
            ]
        );
        $saved = legal_version_row($documentId, $versionNumber);
    }

    audit_log('legal.draft_saved', 'legal_document', $documentId, [
        'document_type' => $type,
        'version'       => (int)($saved['version_number'] ?? 0),
        'bytes'         => strlen($clean),
    ], $actor);

    return $saved ?? [];
}

/** Discard the current draft. Published versions are untouched. */
function legal_discard_draft(string $type, ?array $actor): void
{
    $document = legal_document($type);
    if ($document === null) {
        throw new InvalidArgumentException('Unknown legal document.');
    }
    $draft = legal_draft_for((string)$document['id']);
    if ($draft === null) {
        return;
    }
    db_exec(
        'DELETE FROM ' . LEGAL_VERSION_TABLE . ' WHERE id = :id AND status = :status',
        [':id' => (string)$draft['id'], ':status' => LEGAL_STATUS_DRAFT]
    );
    audit_log('legal.draft_discarded', 'legal_document', (string)$document['id'], [
        'document_type' => $type,
        'version'       => (int)$draft['version_number'],
    ], $actor);
}

/**
 * Publish a version.
 *
 * Runs in one immediate transaction:
 *   1. the previous published version becomes `superseded` (kept whole);
 *   2. the version being published becomes `published`, stamped with the time
 *      and the administrator;
 *   3. the document's pointer moves to it.
 *
 * If any step fails the transaction rolls back and the live document is exactly
 * what it was before the request.
 *
 * @param array      $version       the version row to publish
 * @param array|null $actor
 * @param string|null $effectiveAt  ISO date (defaults to now); never in the future
 * @param string     $changeNote    why this version exists
 * @param int|null   $restoredFrom  set when this publication restores an older version
 */
function legal_publish_version(
    array $version,
    ?array $actor,
    ?string $effectiveAt = null,
    string $changeNote = '',
    ?int $restoredFrom = null
): array {
    $documentId = (string)$version['document_id'];
    $document = db_one('SELECT * FROM ' . LEGAL_DOCUMENT_TABLE . ' WHERE id = :id LIMIT 1', [':id' => $documentId]);
    if ($document === null) {
        throw new InvalidArgumentException('Unknown legal document.');
    }
    if ((string)$version['status'] !== LEGAL_STATUS_DRAFT) {
        throw new InvalidArgumentException('Only a draft can be published.');
    }

    $content = (string)($version['content_html'] ?? '');
    if (trim(strip_tags($content)) === '') {
        throw new InvalidArgumentException('The draft has no content to publish.');
    }

    $actor = $actor ?? auth_user();
    $now = db_now();
    $effective = $now;
    if ($effectiveAt !== null && trim($effectiveAt) !== '') {
        $timestamp = strtotime($effectiveAt);
        if ($timestamp === false) {
            throw new InvalidArgumentException('The effective date is not a valid date.');
        }
        if ($timestamp > time() + 86400) {
            throw new InvalidArgumentException('The effective date cannot be in the future: publishing makes the version live immediately.');
        }
        $effective = gmdate('Y-m-d H:i:s', $timestamp);
    }

    db_transaction_immediate(function () use ($document, $version, $actor, $now, $effective, $changeNote, $restoredFrom): void {
        // 1. Retire the version that is public right now, keeping every field.
        db_exec(
            'UPDATE ' . LEGAL_VERSION_TABLE . '
                SET status = :superseded
              WHERE document_id = :doc AND status = :published',
            [
                ':superseded' => LEGAL_STATUS_SUPERSEDED,
                ':doc'        => (string)$document['id'],
                ':published'  => LEGAL_STATUS_PUBLISHED,
            ]
        );

        // 2. Publish the draft in place: the row identity never changes, so the
        //    version number an acceptance points at stays valid forever.
        db_exec(
            'UPDATE ' . LEGAL_VERSION_TABLE . '
                SET status = :status, published_at = :now, published_by = :by,
                    published_by_name = :by_name, effective_at = :effective, updated_at = :now,
                    change_note = :note, restored_from_version = :restored
              WHERE id = :id AND status = :draft',
            [
                ':status'    => LEGAL_STATUS_PUBLISHED,
                ':now'       => $now,
                ':by'        => (string)($actor['id'] ?? ''),
                ':by_name'   => (string)($actor['name'] ?? ''),
                ':effective' => $effective,
                ':note'      => clean_string($changeNote, 500),
                ':restored'  => $restoredFrom,
                ':id'        => (string)$version['id'],
                ':draft'     => LEGAL_STATUS_DRAFT,
            ]
        );

        // 3. Move the public pointer.
        db_exec(
            'UPDATE ' . LEGAL_DOCUMENT_TABLE . '
                SET current_version_id = :version, updated_at = :now
              WHERE id = :id',
            [':version' => (string)$version['id'], ':now' => $now, ':id' => (string)$document['id']]
        );
    });

    $published = db_one('SELECT * FROM ' . LEGAL_VERSION_TABLE . ' WHERE id = :id LIMIT 1', [':id' => (string)$version['id']]);

    audit_log('legal.published', 'legal_document', (string)$document['id'], [
        'document_type'    => (string)$document['document_type'],
        'version'          => (int)($published['version_number'] ?? 0),
        'effective_at'     => $effective,
        'restored_from'    => $restoredFrom,
        'has_change_note'  => trim($changeNote) !== '',
    ], $actor);

    return $published ?? [];
}

/**
 * Restore an earlier published version.
 *
 * The old row is never edited or re-pointed: a NEW version is created with a new
 * number, copying the old body, and that new version is published. The history
 * therefore shows a fresh publication event that says what it restored.
 */
function legal_restore_version(string $type, int $versionNumber, ?array $actor, string $changeNote = ''): array
{
    $document = legal_document($type);
    if ($document === null) {
        throw new InvalidArgumentException('Unknown legal document.');
    }
    $source = legal_version_row((string)$document['id'], $versionNumber);
    if ($source === null) {
        throw new InvalidArgumentException('That version does not exist.');
    }
    if ((string)$source['status'] === LEGAL_STATUS_DRAFT) {
        throw new InvalidArgumentException('A draft cannot be restored; only a published version can.');
    }
    if ((string)$source['status'] === LEGAL_STATUS_PUBLISHED) {
        throw new InvalidArgumentException('That version is already the published version.');
    }

    $now = db_now();
    $actor = $actor ?? auth_user();
    $documentId = (string)$document['id'];
    $newNumber = legal_next_version_number($documentId);
    $newId = new_id('legalv');
    $note = trim($changeNote) !== ''
        ? trim($changeNote)
        : 'Restored version ' . $versionNumber . '.';

    db_exec(
        'INSERT INTO ' . LEGAL_VERSION_TABLE . '
            (id, document_id, version_number, status, title, content_html, change_note,
             effective_at, created_by, created_by_name, created_at, updated_at,
             published_at, published_by, published_by_name, restored_from_version)
         VALUES (:id, :doc, :number, :status, :title, :content, \'\',
                 NULL, :by, :by_name, :now, :now, NULL, NULL, \'\', :restored)',
        [
            ':id'       => $newId,
            ':doc'      => $documentId,
            ':number'   => $newNumber,
            ':status'   => LEGAL_STATUS_DRAFT,
            ':title'    => (string)$source['title'],
            ':content'  => (string)$source['content_html'],
            ':by'       => (string)($actor['id'] ?? ''),
            ':by_name'  => (string)($actor['name'] ?? ''),
            ':now'      => $now,
            ':restored' => $versionNumber,
        ]
    );

    $draft = legal_version_row($documentId, $newNumber);
    if ($draft === null) {
        throw new RuntimeException('The restored version could not be stored.');
    }

    return legal_publish_version($draft, $actor, null, $note, $versionNumber);
}

// ---------------------------------------------------------------------------
// Acceptances
// ---------------------------------------------------------------------------

/**
 * Record that one account accepted one document version.
 *
 * Insert-only. A repeat submission for the same account, document and version
 * is a no-op, so a retried registration request cannot duplicate the record and
 * an existing record is never altered.
 *
 * @param array $version a version row (the published version that was accepted)
 */
function legal_record_acceptance(string $userId, string $type, array $version, string $source = 'registration'): void
{
    if ($userId === '' || !legal_is_type($type)) {
        throw new InvalidArgumentException('An acceptance needs an account and a document.');
    }
    if ((string)($version['id'] ?? '') === '' || !isset($version['version_number'])) {
        throw new InvalidArgumentException('An acceptance needs the version that was accepted.');
    }
    if ((string)($version['status'] ?? LEGAL_STATUS_PUBLISHED) !== LEGAL_STATUS_PUBLISHED) {
        throw new InvalidArgumentException('Only a published version can be accepted.');
    }

    try {
        db_exec(
            'INSERT INTO ' . LEGAL_ACCEPTANCE_TABLE . '
                (id, user_id, document_type, version_id, version_number, source, accepted_at)
             VALUES (:id, :user, :type, :version_id, :number, :source, :now)',
            [
                ':id'         => new_id('legalacc'),
                ':user'       => $userId,
                ':type'       => $type,
                ':version_id' => (string)$version['id'],
                ':number'     => (int)$version['version_number'],
                ':source'     => clean_string($source, 32),
                ':now'        => db_now(),
            ]
        );
    } catch (Throwable $e) {
        if (db_is_unique_violation($e)) {
            return; // already recorded; never overwrite
        }
        throw $e;
    }
}

/** The newest acceptance by one account of one document. */
function legal_latest_acceptance(string $userId, string $type): ?array
{
    return db_one(
        'SELECT * FROM ' . LEGAL_ACCEPTANCE_TABLE . '
          WHERE user_id = :user AND document_type = :type
          ORDER BY version_number DESC, accepted_at DESC LIMIT 1',
        [':user' => $userId, ':type' => $type]
    );
}

/** Has the administrator switched on "ask accounts to re-accept the Terms"? */
function legal_reacceptance_required(): bool
{
    $row = function_exists('platform_setting_row') ? platform_setting_row(LEGAL_REACCEPTANCE_SETTING) : null;
    if ($row === null) {
        return false;
    }

    return (string)($row['setting_value'] ?? '') === 'required';
}

/**
 * Where one account stands on each document.
 *
 * `needsAcceptance` is only acted on when an administrator has switched the
 * re-acceptance prompt on: publishing a new version must never silently change
 * what an existing account is allowed to do.
 */
function legal_acceptance_state(array $user): array
{
    $userId = (string)($user['id'] ?? '');
    $state = ['reacceptanceRequired' => legal_reacceptance_required()];

    foreach (LEGAL_DOCUMENT_TYPES as $type) {
        $current = legal_current_published($type);
        $accepted = $userId !== '' ? legal_latest_acceptance($userId, $type) : null;
        $currentVersion = $current !== null ? (int)$current['version_number'] : 0;
        $acceptedVersion = $accepted !== null ? (int)$accepted['version_number'] : null;

        $state[$type] = [
            'currentVersion'  => $currentVersion,
            'currentEffectiveAt' => $current !== null ? to_iso($current['effective_at'] ?? null) : null,
            'acceptedVersion' => $acceptedVersion,
            'acceptedAt'      => $accepted !== null ? to_iso($accepted['accepted_at'] ?? null) : null,
            'acceptedSource'  => $accepted !== null ? (string)($accepted['source'] ?? '') : null,
            'needsAcceptance' => $currentVersion > 0
                && ($acceptedVersion === null || $acceptedVersion < $currentVersion),
        ];
    }

    return $state;
}

/** A boolean an honest client sends, read strictly. Never inferred from absence. */
function legal_flag_true($value): bool
{
    return $value === true
        || $value === 1
        || $value === '1'
        || (is_string($value) && in_array(strtolower(trim($value)), ['true', 'on', 'yes'], true));
}

/**
 * Check the consent half of a registration request.
 *
 * @return array{ok:bool,status?:int,fields?:array,message?:string,terms?:array,privacy?:array}
 */
function legal_registration_acceptance(array $input): array
{
    $fields = [];
    if (!legal_flag_true($input['termsAccepted'] ?? null)) {
        $fields['termsAccepted'] = 'Please tick the box to accept the Terms and Conditions.';
    }
    if (!legal_flag_true($input['privacyAcknowledged'] ?? null)) {
        $fields['privacyAcknowledged'] = 'Please confirm that you have read the Privacy Policy.';
    }
    if ($fields !== []) {
        return [
            'ok'      => false,
            'status'  => 422,
            'fields'  => $fields,
            'message' => 'Please accept the Terms and Conditions and acknowledge the Privacy Policy to create an account.',
        ];
    }

    try {
        $terms = legal_current_published('terms');
        $privacy = legal_current_published('privacy');
    } catch (Throwable $e) {
        gl_log('error', 'Legal documents are unavailable during registration', ['error' => $e->getMessage()]);

        return [
            'ok'      => false,
            'status'  => 503,
            'message' => 'Account creation is temporarily unavailable because the legal documents could not be loaded. Please try again shortly.',
        ];
    }

    if ($terms === null || $privacy === null) {
        return [
            'ok'      => false,
            'status'  => 503,
            'message' => 'Account creation is temporarily unavailable because no published Terms and Conditions and Privacy Policy are configured.',
        ];
    }

    // A client that told us which version it displayed must still be looking at
    // that version: accepting v3 while v4 is live is not acceptance of v4.
    $fields = [];
    $sentTerms = $input['termsVersion'] ?? null;
    if (is_numeric($sentTerms) && (int)$sentTerms !== (int)$terms['version_number']) {
        $fields['termsAccepted'] = 'The Terms and Conditions changed while you were completing the form. Please read the current version and accept it again.';
    }
    $sentPrivacy = $input['privacyVersion'] ?? null;
    if (is_numeric($sentPrivacy) && (int)$sentPrivacy !== (int)$privacy['version_number']) {
        $fields['privacyAcknowledged'] = 'The Privacy Policy changed while you were completing the form. Please read the current version and acknowledge it again.';
    }
    if ($fields !== []) {
        return [
            'ok'      => false,
            'status'  => 409,
            'fields'  => $fields,
            'message' => 'The legal documents changed while you were completing the form. Please read and accept the current versions.',
        ];
    }

    return ['ok' => true, 'terms' => $terms, 'privacy' => $privacy];
}

// ---------------------------------------------------------------------------
// HTTP handlers — public
// ---------------------------------------------------------------------------

/** GET /legal — both documents' identity and version, no bodies. */
function handle_legal_index(): void
{
    legal_ensure_documents();
    json_response([
        'success'   => true,
        'documents' => legal_public_index(),
    ]);
}

/** GET /legal/{slug} — the latest PUBLISHED version, and nothing else. */
function handle_legal_document(array $params): void
{
    $slug = (string)($params[0] ?? '');
    $type = legal_type_for_slug($slug);
    if ($type === null) {
        error_response('That legal document does not exist.', 404);
    }

    legal_ensure_documents();
    $document = legal_public_document($type);
    if ($document === null) {
        error_response('That legal document is not published yet.', 404);
    }

    json_response(['success' => true, 'document' => $document]);
}

// ---------------------------------------------------------------------------
// HTTP handlers — administrator
// ---------------------------------------------------------------------------

/** One document, everything the console needs, including its draft. */
function legal_admin_document_payload(string $type): array
{
    $document = legal_document($type);
    if ($document === null) {
        error_response('That legal document does not exist.', 404);
    }
    $documentId = (string)$document['id'];
    $published = legal_current_published($type);
    $draft = legal_draft_for($documentId);
    $versions = legal_versions_for($documentId);

    return [
        'type'      => $type,
        'slug'      => (string)$document['slug'],
        'title'     => (string)$document['title'],
        'summary'   => (string)($document['summary'] ?? ''),
        'updatedAt' => to_iso($document['updated_at'] ?? null),
        'published' => $published !== null ? legal_shape_version($published, true) : null,
        'draft'     => $draft !== null ? legal_shape_version($draft, true) : null,
        'versions'  => array_map(
            static fn(array $row): array => legal_shape_version($row),
            $versions
        ),
        'historyCount' => count($versions),
    ];
}

/** GET /admin/legal — the two documents' summary, for the console tabs. */
function handle_admin_legal_index(): void
{
    $user = require_legal_manage();
    legal_ensure_documents();

    $documents = [];
    foreach (LEGAL_DOCUMENT_TYPES as $type) {
        $document = legal_document($type);
        if ($document === null) {
            continue;
        }
        $published = legal_current_published($type);
        $draft = legal_draft_for((string)$document['id']);
        $documents[] = [
            'type'          => $type,
            'slug'          => (string)$document['slug'],
            'title'         => (string)$document['title'],
            'summary'       => (string)($document['summary'] ?? ''),
            'published'     => $published !== null ? legal_shape_version($published) : null,
            'hasDraft'      => $draft !== null,
            'draftUpdatedAt' => $draft !== null ? to_iso($draft['updated_at'] ?? null) : null,
            'versionCount'  => count(legal_versions_for((string)$document['id'])),
        ];
    }

    json_response([
        'success'              => true,
        'documents'            => $documents,
        'capabilities'         => legal_capabilities($user),
        'reacceptanceRequired' => legal_reacceptance_required(),
    ]);
}

/** GET /admin/legal/{type} — published version, draft and full history. */
function handle_admin_legal_document(array $params): void
{
    require_legal_manage();
    legal_ensure_documents();
    $type = strtolower((string)($params[0] ?? ''));
    if (!legal_is_type($type)) {
        error_response('That legal document does not exist.', 404);
    }

    json_response(['success' => true, 'document' => legal_admin_document_payload($type)]);
}

/** GET /admin/legal/{type}/versions/{n} — one stored version, for review. */
function handle_admin_legal_version(array $params): void
{
    require_legal_manage();
    legal_ensure_documents();
    $type = strtolower((string)($params[0] ?? ''));
    if (!legal_is_type($type)) {
        error_response('That legal document does not exist.', 404);
    }
    $document = legal_document($type);
    $row = legal_version_row((string)$document['id'], (int)($params[1] ?? 0));
    if ($row === null) {
        error_response('That version does not exist.', 404);
    }

    json_response(['success' => true, 'version' => legal_shape_version($row, true)]);
}

/** PUT /admin/legal/{type}/draft — save a draft without publishing. */
function handle_admin_legal_save_draft(array $params): void
{
    $user = require_legal_manage();
    $type = strtolower((string)($params[0] ?? ''));
    if (!legal_is_type($type)) {
        error_response('That legal document does not exist.', 404);
    }

    $input = request_json();
    $content = is_string($input['contentHtml'] ?? null) ? (string)$input['contentHtml'] : '';
    $title = is_string($input['title'] ?? null) ? clean_string($input['title'], 200) : '';

    try {
        $draft = legal_save_draft($type, $content, $user, $title);
    } catch (InvalidArgumentException $e) {
        error_response($e->getMessage(), 422, ['contentHtml' => $e->getMessage()]);
    }

    json_response([
        'success' => true,
        'draft'   => legal_shape_version($draft, true),
        'message' => 'Draft saved. The published page has not changed.',
    ]);
}

/** POST /admin/legal/{type}/preview — render a body as the public page would. */
function handle_admin_legal_preview(array $params): void
{
    require_legal_manage();
    $type = strtolower((string)($params[0] ?? ''));
    if (!legal_is_type($type)) {
        error_response('That legal document does not exist.', 404);
    }

    $input = request_json();
    $content = is_string($input['contentHtml'] ?? null) ? (string)$input['contentHtml'] : '';

    try {
        $clean = legal_clean_content($content);
    } catch (InvalidArgumentException $e) {
        error_response($e->getMessage(), 422, ['contentHtml' => $e->getMessage()]);
    }

    $seed = legal_seed_document($type);
    json_response([
        'success' => true,
        'preview' => [
            'type'        => $type,
            'title'       => $seed['title'],
            'contentHtml' => $clean,
            'isPreview'   => true,
        ],
    ]);
}

/** POST /admin/legal/{type}/publish — make the draft public, after confirmation. */
function handle_admin_legal_publish(array $params): void
{
    $user = require_legal_publish();
    legal_ensure_documents();
    $type = strtolower((string)($params[0] ?? ''));
    if (!legal_is_type($type)) {
        error_response('That legal document does not exist.', 404);
    }

    $input = request_json();
    if (!legal_flag_true($input['confirm'] ?? null)) {
        error_response('Confirm the publication before it goes live.', 422, [
            'confirm' => 'Publication must be confirmed.',
        ]);
    }

    $document = legal_document($type);
    $draft = legal_draft_for((string)$document['id']);
    if ($draft === null) {
        error_response('There is no saved draft to publish. Save a draft first.', 409);
    }

    $changeNote = is_string($input['changeNote'] ?? null) ? (string)$input['changeNote'] : '';
    $effectiveAt = is_string($input['effectiveAt'] ?? null) ? (string)$input['effectiveAt'] : null;

    try {
        $published = legal_publish_version($draft, $user, $effectiveAt, $changeNote);
    } catch (InvalidArgumentException $e) {
        error_response($e->getMessage(), 422);
    }

    json_response([
        'success'   => true,
        'published' => legal_shape_version($published, true),
        'message'   => 'Published. The public page now shows version ' . (int)($published['version_number'] ?? 0) . '.',
    ]);
}

/** POST /admin/legal/{type}/restore — publish an older version as a NEW version. */
function handle_admin_legal_restore(array $params): void
{
    $user = require_legal_publish();
    legal_ensure_documents();
    $type = strtolower((string)($params[0] ?? ''));
    if (!legal_is_type($type)) {
        error_response('That legal document does not exist.', 404);
    }

    $input = request_json();
    if (!legal_flag_true($input['confirm'] ?? null)) {
        error_response('Confirm the restoration before it goes live.', 422, [
            'confirm' => 'Restoration must be confirmed.',
        ]);
    }
    $versionNumber = (int)($input['version'] ?? 0);
    if ($versionNumber < 1) {
        error_response('Choose a version to restore.', 422);
    }

    // A pending draft would be left behind by a restoration. Refuse rather than
    // silently discard an administrator's unpublished work.
    $document = legal_document($type);
    if (legal_draft_for((string)$document['id']) !== null) {
        error_response(
            'This document has an unpublished draft. Publish it, or discard it, before restoring an older version.',
            409
        );
    }

    try {
        $published = legal_restore_version($type, $versionNumber, $user, is_string($input['changeNote'] ?? null) ? (string)$input['changeNote'] : '');
    } catch (InvalidArgumentException $e) {
        error_response($e->getMessage(), 422);
    }

    json_response([
        'success'   => true,
        'published' => legal_shape_version($published, true),
        'message'   => 'Restored as version ' . (int)($published['version_number'] ?? 0) . '. The earlier versions are unchanged.',
    ]);
}

/** DELETE /admin/legal/{type}/draft — throw away an unpublished draft. */
function handle_admin_legal_discard_draft(array $params): void
{
    $user = require_legal_manage();
    $type = strtolower((string)($params[0] ?? ''));
    if (!legal_is_type($type)) {
        error_response('That legal document does not exist.', 404);
    }

    legal_discard_draft($type, $user);

    json_response(['success' => true, 'message' => 'Draft discarded. The published page has not changed.']);
}

/** PUT /admin/legal/reacceptance — switch the re-acceptance prompt on or off. */
function handle_admin_legal_reacceptance(array $params): void
{
    $user = require_legal_publish();
    $input = request_json();
    $required = legal_flag_true($input['required'] ?? null);
    $value = $required ? 'required' : 'off';

    platform_setting_write(LEGAL_REACCEPTANCE_SETTING, $value, 'string', $user);
    audit_log('legal.reacceptance_setting_changed', 'platform_setting', LEGAL_REACCEPTANCE_SETTING, [
        'value' => $value,
    ], $user);

    json_response([
        'success'              => true,
        'reacceptanceRequired' => $required,
        'message'              => $required
            ? 'Account holders will be asked to accept the current Terms and Conditions.'
            : 'The re-acceptance prompt is off.',
    ]);
}

// ---------------------------------------------------------------------------
// HTTP handler — the account holder records a fresh acceptance
// ---------------------------------------------------------------------------

/**
 * POST /account/legal-acceptance
 *
 * Records a fresh, explicit acceptance for the signed-in account, against
 * whatever is published right now. Nothing is recorded unless the client sends
 * the flags, and the Terms acceptance and the Privacy acknowledgement remain two
 * separate records.
 */
function handle_account_legal_acceptance(): void
{
    $user = require_auth();
    legal_ensure_documents();
    $input = request_json();

    $termsAccepted = legal_flag_true($input['termsAccepted'] ?? null);
    $privacyAcknowledged = legal_flag_true($input['privacyAcknowledged'] ?? null);
    if (!$termsAccepted && !$privacyAcknowledged) {
        error_response('Tick the documents you are accepting.', 422, [
            'termsAccepted' => 'Nothing was recorded.',
        ]);
    }

    $recorded = [];
    if ($termsAccepted) {
        $terms = legal_current_published('terms');
        if ($terms === null) {
            error_response('The Terms and Conditions are not available right now.', 503);
        }
        legal_record_acceptance((string)$user['id'], 'terms', $terms, 'reacceptance');
        $recorded['termsVersion'] = (int)$terms['version_number'];
    }
    if ($privacyAcknowledged) {
        $privacy = legal_current_published('privacy');
        if ($privacy === null) {
            error_response('The Privacy Policy is not available right now.', 503);
        }
        legal_record_acceptance((string)$user['id'], 'privacy', $privacy, 'reacceptance');
        $recorded['privacyVersion'] = (int)$privacy['version_number'];
    }

    audit_log('legal.accepted', 'user', (string)$user['id'], $recorded + ['source' => 'reacceptance'], $user);

    json_response([
        'success'      => true,
        'recorded'     => $recorded,
        'legal'        => legal_acceptance_state($user),
        'message'      => 'Thank you. Your acceptance has been recorded.',
    ]);
}
