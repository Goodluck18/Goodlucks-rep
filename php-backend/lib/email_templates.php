<?php
/**
 * Goodlucks Homes - the editable layer of the transactional emails
 *
 * There was no template editor before this task: every email body was written
 * inline at the place that sends it (`api.php`, `alerts.php`, `viewings.php`).
 * Rather than rebuilding that pipeline — which is 4,000 lines of carefully
 * reviewed business messaging — this adds one small, additive layer on top of
 * it:
 *
 *   `email_templates` holds content an administrator writes ONCE and wants
 *   appended to a chosen transactional email. The email keeps its own facts
 *   (names, references, dates, amounts); the template adds the extra paragraph
 *   or the article link the business wants to push.
 *
 * Consequences that matter:
 *   - with no templates stored, every email is byte-for-byte what it was before
 *     this task (the hook in mailer.php does nothing);
 *   - an admin cannot accidentally delete the reference number from an approval
 *     email, because they never replace its body;
 *   - the blog integration is a link in that content, which is exactly the
 *     use case ("Read our guide to renting in Ghana").
 *
 * Only `published` articles may be linked. A template whose link has since been
 * unpublished is reported to the editor and is NOT sent, so a customer never
 * receives a link to a draft or a dead page.
 */

declare(strict_types=1);

/**
 * The transactional emails a template may be attached to.
 *
 * Internal notification mail (to staff) and password resets are deliberately
 * absent: one is not customer content, and the other must never carry
 * marketing that could be confused with the reset instruction.
 *
 * @return array<string, string> type => human label
 */
function email_template_targets(): array
{
    return [
        'enquiry_confirmation' => 'Enquiry received (visitor)',
        'enquiry_received'     => 'New enquiry (landlord or agent)',
        'viewing_requested'    => 'Viewing request received',
        'viewing_update'       => 'Viewing update',
        'match_found'          => 'Property matches available',
        'tenant_request'       => 'Rental matching request received',
        'search_alert'         => 'Search alert active',
        'price_alert'          => 'Price alert',
        'price_drop_alert'     => 'Price drop alert',
        'alert_subscription'   => 'Alert subscription',
        'property_submission'  => 'Property submitted for review',
        'property_approval'    => 'Property approved',
        'property_rejection'   => 'Property needs attention',
        'registration'         => 'Welcome / registration',
    ];
}

/** Longest template body we store. */
const EMAIL_TEMPLATE_MAX_CHARS = 20000;

function email_template_statuses(): array
{
    return ['active', 'inactive'];
}

function email_template_by_id(string $id): ?array
{
    return db_one('SELECT * FROM email_templates WHERE id = :id', [':id' => $id]);
}

/**
 * Report every article link in a template body.
 *
 * Statuses: `published` (fine), `draft` / `scheduled` / `unpublished` (not
 * public), `missing` (nothing at that slug — usually a typo or a deleted
 * article), `invalid` (the slug is not a slug this site would route).
 *
 * @return array<int, array{url: string, slug: string, status: string, title: string}>
 */
function email_template_link_report(string $html): array
{
    $report = [];
    foreach (blog_html_links($html) as $href) {
        $slug = blog_slug_from_url($href);
        if ($slug === null) {
            continue;
        }
        $post = blog_post_by_slug($slug);
        if ($post === null) {
            $report[] = ['url' => $href, 'slug' => $slug, 'status' => 'missing', 'title' => ''];
            continue;
        }
        $report[] = [
            'url'    => $href,
            'slug'   => $slug,
            'status' => (string)$post['status'],
            'title'  => (string)$post['title'],
        ];
    }

    return $report;
}

/**
 * The links a reader could not follow because the article is not public.
 *
 * @param array<int, array{status: string}> $report
 */
function email_template_broken_links(array $report): array
{
    return array_values(array_filter($report, static fn($link) => ($link['status'] ?? '') !== 'published'));
}

function email_template_shape(array $row): array
{
    $body = (string)($row['body_html'] ?? '');
    $links = email_template_link_report($body);
    $broken = email_template_broken_links($links);

    return [
        'id'          => (string)$row['id'],
        'name'        => (string)$row['name'],
        'targetType'  => (string)$row['target_type'],
        'targetLabel' => email_template_targets()[(string)$row['target_type']] ?? (string)$row['target_type'],
        'bodyHtml'    => $body,
        'status'      => (string)$row['status'],
        'links'       => $links,
        'brokenLinks' => $broken,
        'needsAttention' => $broken !== [],
        'createdAt'   => to_iso($row['created_at'] ?? null),
        'updatedAt'   => to_iso($row['updated_at'] ?? null),
    ];
}

function email_template_all(): array
{
    $rows = db_all('SELECT * FROM email_templates ORDER BY target_type ASC, created_at ASC', []);

    return array_map('email_template_shape', $rows);
}

/**
 * Validate a template body: HTML is sanitised to the article allowlist (without
 * images or embeds — this is an email), and every article link must point at a
 * published post.
 */
function email_template_clean_body(string $html): string
{
    if (mb_strlen($html) > EMAIL_TEMPLATE_MAX_CHARS) {
        error_response('That template is too long (limit ' . EMAIL_TEMPLATE_MAX_CHARS . ' characters).', 422);
    }
    $clean = blog_sanitize_html($html, ['allow_media' => false]);

    $broken = email_template_broken_links(email_template_link_report($clean));
    if ($broken !== []) {
        $names = [];
        foreach ($broken as $link) {
            $names[] = '“' . ($link['title'] !== '' ? $link['title'] : $link['slug']) . '” (' . $link['status'] . ')';
        }
        error_response(
            'This template links to an article that is not published: ' . implode(', ', $names)
            . '. Publish the article first, or remove the link.',
            422,
            ['bodyHtml' => 'A linked article is not published.']
        );
    }

    return $clean;
}

function email_template_validate_input(array $input, bool $isCreate): array
{
    $clean = [];

    if ($isCreate || array_key_exists('name', $input)) {
        $name = clean_string($input['name'] ?? '', 160);
        if (mb_strlen($name) < 3) {
            error_response('Give the template a name of at least 3 characters.', 422, ['name' => 'Enter a name.']);
        }
        $clean['name'] = $name;
    }

    if ($isCreate || array_key_exists('targetType', $input)) {
        $target = (string)($input['targetType'] ?? '');
        if (!isset(email_template_targets()[$target])) {
            error_response('Choose which email this template is added to.', 422, [
                'targetType' => 'Choose one of the listed emails.',
            ]);
        }
        $clean['target_type'] = $target;
    }

    if ($isCreate || array_key_exists('bodyHtml', $input)) {
        $clean['body_html'] = email_template_clean_body((string)($input['bodyHtml'] ?? ''));
        if (trim(strip_tags($clean['body_html'])) === '') {
            error_response('Add the content you want included in the email.', 422, [
                'bodyHtml' => 'The template has no content.',
            ]);
        }
    }

    if (array_key_exists('status', $input)) {
        $status = one_of($input['status'], email_template_statuses());
        if ($status === null) {
            error_response('Choose active or inactive.', 422, ['status' => 'Choose a valid status.']);
        }
        $clean['status'] = $status;
    }

    return $clean;
}

function email_template_create(array $input, array $actor): array
{
    $fields = email_template_validate_input($input, true);
    $id = new_id('emailtpl');
    $now = db_now();
    db_exec(
        'INSERT INTO email_templates (id, name, target_type, body_html, status, created_by, updated_by, created_at, updated_at)
         VALUES (:id, :name, :target, :body, :status, :created, :updated, :now, :now2)',
        [
            ':id'      => $id,
            ':name'    => (string)$fields['name'],
            ':target'  => (string)$fields['target_type'],
            ':body'    => (string)$fields['body_html'],
            ':status'  => (string)($fields['status'] ?? 'active'),
            ':created' => (string)$actor['id'],
            ':updated' => (string)$actor['id'],
            ':now'     => $now,
            ':now2'    => $now,
        ]
    );
    audit_log('email_template.created', 'email_template', $id, [
        'targetType' => (string)$fields['target_type'],
    ], $actor);

    $row = email_template_by_id($id);
    if ($row === null) {
        error_response('The template could not be read back after saving.', 500);
    }

    return email_template_shape($row);
}

function email_template_update(string $id, array $input, array $actor): array
{
    $row = email_template_by_id($id);
    if ($row === null) {
        error_response('That template no longer exists.', 404);
    }
    $fields = email_template_validate_input($input, false);
    if ($fields === []) {
        return email_template_shape($row);
    }

    $assignments = [];
    $params = [':id' => $id, ':now' => db_now(), ':by' => (string)$actor['id']];
    foreach ($fields as $column => $value) {
        $assignments[] = $column . ' = :' . $column;
        $params[':' . $column] = $value;
    }
    $assignments[] = 'updated_by = :by';
    $assignments[] = 'updated_at = :now';
    db_exec('UPDATE email_templates SET ' . implode(', ', $assignments) . ' WHERE id = :id', $params);
    audit_log('email_template.updated', 'email_template', $id, ['fields' => array_keys($fields)], $actor);

    return email_template_shape(email_template_by_id($id) ?? $row);
}

function email_template_delete(string $id, array $actor): void
{
    $row = email_template_by_id($id);
    if ($row === null) {
        error_response('That template no longer exists.', 404);
    }
    db_exec('DELETE FROM email_templates WHERE id = :id', [':id' => $id]);
    audit_log('email_template.deleted', 'email_template', $id, ['targetType' => (string)$row['target_type']], $actor);
}

/**
 * Active templates for one transactional email, ready to append.
 *
 * A template is skipped when any article it links to is no longer published:
 * the email then goes out unchanged rather than with a broken link. The skip is
 * logged so the console can explain why the paragraph is missing.
 *
 * @return array<int, array<string, mixed>> shaped templates
 */
function email_templates_for_type(string $type): array
{
    if ($type === '' || !isset(email_template_targets()[$type])) {
        return [];
    }
    $rows = db_all(
        "SELECT * FROM email_templates WHERE target_type = :type AND status = 'active' ORDER BY created_at ASC",
        [':type' => $type]
    );
    if ($rows === []) {
        return [];
    }
    blog_promote_due_posts();

    $usable = [];
    foreach ($rows as $row) {
        $shape = email_template_shape($row);
        if ($shape['needsAttention']) {
            gl_log('warning', 'Email template skipped: a linked article is not published', [
                'templateId' => $shape['id'],
                'targetType' => $type,
            ]);
            continue;
        }
        $usable[] = $shape;
    }

    return $usable;
}

/**
 * The HTML appended to an outgoing email for one type, or '' when there is
 * nothing to add.
 */
function email_template_extra_html(string $type): string
{
    $templates = email_templates_for_type($type);
    if ($templates === []) {
        return '';
    }

    $html = '';
    foreach ($templates as $template) {
        $html .= '<div style="margin:18px 0 0 0;padding:14px 16px;border-left:3px solid #08D9D6;'
            . 'background:#F7F7F7;border-radius:6px;font-family:Arial,Helvetica,sans-serif;'
            . 'font-size:14px;line-height:1.55;color:#4B5563;">' . $template['bodyHtml'] . '</div>';
    }

    return $html;
}
