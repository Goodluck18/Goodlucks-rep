<?php
/**
 * Goodlucks Homes - Blog & Learning Centre data layer
 *
 * The rules this file enforces, in one place:
 *
 *  - A post is public only when its status is `published`. Drafts, scheduled
 *    posts whose moment has not arrived, and unpublished posts are never
 *    returned by a public read, so nothing can leak through a stray endpoint,
 *    sitemap or email link.
 *  - A scheduled post is promoted automatically once its publish time passes;
 *    nothing else can make it public early.
 *  - Property showcase entries are references, not copies. Every read joins the
 *    live `properties` row, so a new rent or a rented listing is reflected the
 *    next time the article is opened. A deleted listing is dropped.
 *  - The author of a post is the administrator account that saved it; the name
 *    is taken from that account, never typed as free text.
 */

declare(strict_types=1);

/** Post statuses the editor may set. */
function blog_statuses(): array
{
    return ['draft', 'scheduled', 'published', 'unpublished'];
}

/** Display rules for a showcased listing. */
function blog_display_rules(): array
{
    return ['show_status', 'hide_unavailable'];
}

/**
 * Promote scheduled posts whose publication time has arrived.
 *
 * Idempotent and cheap: it is called by every public read and by cron.php, so a
 * scheduled article becomes public on the first request after its time without
 * relying on a second scheduled job.
 */
function blog_promote_due_posts(): int
{
    $now = db_now();
    $rows = db_all(
        "SELECT id, publish_at FROM blog_posts
          WHERE status = 'scheduled' AND publish_at IS NOT NULL AND publish_at <= :now",
        [':now' => $now]
    );
    if ($rows === []) {
        return 0;
    }

    foreach ($rows as $row) {
        db_exec(
            "UPDATE blog_posts
                SET status = 'published',
                    published_at = COALESCE(published_at, publish_at, :now),
                    updated_at = :now2
              WHERE id = :id AND status = 'scheduled'",
            [':now' => $now, ':now2' => $now, ':id' => (string)$row['id']]
        );
        audit_log('blog.post_published_scheduled', 'blog_post', (string)$row['id'], [
            'publishAt' => (string)($row['publish_at'] ?? ''),
        ]);
    }

    return count($rows);
}

/** True when a post row is visible to the public right now. */
function blog_row_is_public(array $row): bool
{
    return (string)($row['status'] ?? '') === 'published';
}

/* -------------------------------------------------------------------------- */
/* Categories                                                                 */
/* -------------------------------------------------------------------------- */

function blog_category_rows(string $order = 'sort_order, name'): array
{
    return db_all('SELECT * FROM blog_categories ORDER BY ' . $order, []);
}

function blog_category_by_slug(string $slug): ?array
{
    return db_one('SELECT * FROM blog_categories WHERE slug = :slug', [':slug' => $slug]);
}

function blog_category_by_id(string $id): ?array
{
    return db_one('SELECT * FROM blog_categories WHERE id = :id', [':id' => $id]);
}

function blog_shape_category(array $row, ?int $postCount = null): array
{
    $shape = [
        'id'          => (string)$row['id'],
        'name'        => (string)$row['name'],
        'slug'        => (string)$row['slug'],
        'description' => (string)($row['description'] ?? ''),
        'sortOrder'   => (int)($row['sort_order'] ?? 0),
        'url'         => SITE_URL . '/blog?category=' . rawurlencode((string)$row['slug']),
    ];
    if ($postCount !== null) {
        $shape['publishedCount'] = $postCount;
    }

    return $shape;
}

/**
 * Create a category. The slug is derived from the name when the caller does not
 * supply one, and uniqueness is enforced here (the database index is the last
 * line of defence, not the only one).
 */
function blog_create_category(array $input, array $actor): array
{
    $name = clean_string($input['name'] ?? '', 120);
    if (mb_strlen($name) < 2) {
        error_response('Enter a category name of at least 2 characters.', 422, ['name' => 'Enter a category name.']);
    }
    $slug = blog_slugify((string)($input['slug'] ?? '')) ?: blog_slugify($name);
    if (!blog_valid_slug($slug)) {
        error_response('The category slug must use lowercase letters, numbers and hyphens.', 422, [
            'slug' => 'Use lowercase letters, numbers and single hyphens.',
        ]);
    }
    if (blog_category_by_slug($slug) !== null) {
        error_response('A category with that slug already exists.', 422, ['slug' => 'That slug is already used.']);
    }

    $id = new_id('blogcat');
    db_exec(
        'INSERT INTO blog_categories (id, name, slug, description, sort_order, created_by, created_at, updated_at)
         VALUES (:id, :name, :slug, :description, :sort, :by, :now, :now2)',
        [
            ':id'          => $id,
            ':name'        => $name,
            ':slug'        => $slug,
            ':description' => clean_string($input['description'] ?? '', 500),
            ':sort'        => valid_int($input['sortOrder'] ?? 0, 0, 999) ?? 0,
            ':by'          => (string)$actor['id'],
            ':now'         => db_now(),
            ':now2'        => db_now(),
        ]
    );
    audit_log('blog.category_created', 'blog_category', $id, ['slug' => $slug], $actor);

    $created = blog_category_by_id($id);
    if ($created === null) {
        error_response('The category could not be read back after saving.', 500);
    }

    return blog_shape_category($created);
}

function blog_update_category(string $id, array $input, array $actor): array
{
    $row = blog_category_by_id($id);
    if ($row === null) {
        error_response('That category no longer exists.', 404);
    }

    $name = array_key_exists('name', $input) ? clean_string($input['name'], 120) : (string)$row['name'];
    if (mb_strlen($name) < 2) {
        error_response('Enter a category name of at least 2 characters.', 422, ['name' => 'Enter a category name.']);
    }

    $slug = (string)$row['slug'];
    if (array_key_exists('slug', $input) && trim((string)$input['slug']) !== '') {
        $candidate = blog_slugify((string)$input['slug']);
        if (!blog_valid_slug($candidate)) {
            error_response('The category slug must use lowercase letters, numbers and hyphens.', 422, [
                'slug' => 'Use lowercase letters, numbers and single hyphens.',
            ]);
        }
        $existing = blog_category_by_slug($candidate);
        if ($existing !== null && (string)$existing['id'] !== $id) {
            error_response('A category with that slug already exists.', 422, ['slug' => 'That slug is already used.']);
        }
        $slug = $candidate;
    }

    db_exec(
        'UPDATE blog_categories
            SET name = :name, slug = :slug, description = :description, sort_order = :sort, updated_at = :now
          WHERE id = :id',
        [
            ':name'        => $name,
            ':slug'        => $slug,
            ':description' => array_key_exists('description', $input)
                ? clean_string($input['description'], 500)
                : (string)($row['description'] ?? ''),
            ':sort'        => array_key_exists('sortOrder', $input)
                ? (valid_int($input['sortOrder'], 0, 999) ?? (int)$row['sort_order'])
                : (int)$row['sort_order'],
            ':now'         => db_now(),
            ':id'          => $id,
        ]
    );
    audit_log('blog.category_updated', 'blog_category', $id, ['slug' => $slug], $actor);

    return blog_shape_category(blog_category_by_id($id) ?? $row);
}

/**
 * Delete a category that nothing uses.
 *
 * A category with articles is refused rather than silently detaching them: an
 * administrator should decide where those posts belong first.
 */
function blog_delete_category(string $id, array $actor): void
{
    $row = blog_category_by_id($id);
    if ($row === null) {
        error_response('That category no longer exists.', 404);
    }
    $inUse = (int)db_value('SELECT COUNT(*) FROM blog_posts WHERE category_id = :id', [':id' => $id]);
    if ($inUse > 0) {
        error_response(
            'Move the ' . $inUse . ' article' . ($inUse === 1 ? '' : 's') . ' in this category first.',
            409,
            ['category' => 'This category still has articles.']
        );
    }
    db_exec('DELETE FROM blog_categories WHERE id = :id', [':id' => $id]);
    audit_log('blog.category_deleted', 'blog_category', $id, ['slug' => (string)$row['slug']], $actor);
}

/* -------------------------------------------------------------------------- */
/* Posts                                                                      */
/* -------------------------------------------------------------------------- */

function blog_post_by_id(string $id): ?array
{
    return db_one('SELECT * FROM blog_posts WHERE id = :id', [':id' => $id]);
}

/** A published post by slug, or null. Drafts are never returned here. */
function blog_public_post_by_slug(string $slug): ?array
{
    if (!blog_valid_slug($slug)) {
        return null;
    }
    blog_promote_due_posts();
    $row = db_one(
        "SELECT * FROM blog_posts WHERE slug = :slug AND status = 'published'",
        [':slug' => $slug]
    );

    return $row !== null && blog_row_is_public($row) ? $row : null;
}

/** Any post by slug (admin preview / duplicate-slug checks). */
function blog_post_by_slug(string $slug): ?array
{
    return db_one('SELECT * FROM blog_posts WHERE slug = :slug', [':slug' => $slug]);
}

/**
 * A slug that is free, derived from what the author asked for.
 *
 * `legon-guide` becomes `legon-guide-2`, `-3`… only when the base is taken by a
 * different post.
 */
function blog_unique_slug(string $desired, string $excludeId = ''): string
{
    $base = blog_slugify($desired);
    if ($base === '') {
        $base = 'article';
    }
    $base = mb_substr($base, 0, BLOG_SLUG_MAX - 4);
    $candidate = $base;
    $suffix = 2;
    while (true) {
        $existing = blog_post_by_slug($candidate);
        if ($existing === null || (string)$existing['id'] === $excludeId) {
            return $candidate;
        }
        $candidate = $base . '-' . $suffix;
        $suffix++;
        if ($suffix > 200) {
            // Extremely unlikely; fall back to a random suffix rather than loop.
            return $base . '-' . substr(bin2hex(random_bytes(4)), 0, 6);
        }
    }
}

/** Tags are stored as a comma-separated list; this normalises what was sent. */
function blog_clean_tags($value): array
{
    $raw = [];
    if (is_array($value)) {
        foreach ($value as $item) {
            if (is_string($item)) {
                $raw[] = $item;
            }
        }
    } elseif (is_string($value)) {
        $raw = explode(',', $value);
    }
    $tags = [];
    foreach ($raw as $tag) {
        $tag = trim(preg_replace('/\s+/u', ' ', $tag) ?? '');
        $tag = mb_substr($tag, 0, 40);
        if ($tag !== '' && !in_array($tag, $tags, true)) {
            $tags[] = $tag;
        }
        if (count($tags) >= 12) {
            break;
        }
    }

    return $tags;
}

/**
 * The portable tag filter value: lower-cased and padded with commas
 * (",rent,legon,"), so a query is a plain `LIKE '%,rent,%'`.
 *
 * @param string[] $tags
 */
function blog_tags_search(array $tags): string
{
    $normalised = [];
    foreach ($tags as $tag) {
        $value = trim(mb_strtolower($tag));
        if ($value !== '') {
            $normalised[] = str_replace(',', ' ', $value);
        }
    }
    if ($normalised === []) {
        return '';
    }

    return ',' . implode(',', $normalised) . ',';
}

function blog_clean_author_name(array $user): string
{
    $name = trim((string)($user['name'] ?? ''));

    return mb_substr($name !== '' ? $name : 'Goodlucks Homes', 0, 200);
}

/**
 * Validate the fields a create/update request may carry.
 *
 * @return array<string, mixed> the cleaned fields, only those supplied
 */
function blog_validate_post_input(array $input, bool $isCreate): array
{
    $clean = [];

    if ($isCreate || array_key_exists('title', $input)) {
        $title = clean_string($input['title'] ?? '', 200);
        if (mb_strlen($title) < 3) {
            error_response('Give the article a title of at least 3 characters.', 422, [
                'title' => 'Enter a title.',
            ]);
        }
        $clean['title'] = $title;
    }

    if (array_key_exists('subtitle', $input)) {
        $clean['subtitle'] = clean_string($input['subtitle'], 400);
    }

    if (array_key_exists('slug', $input)) {
        $raw = trim((string)$input['slug']);
        if ($raw !== '' && !blog_valid_slug(blog_slugify($raw))) {
            error_response('The article slug must use lowercase letters, numbers and hyphens.', 422, [
                'slug' => 'Use lowercase letters, numbers and single hyphens.',
            ]);
        }
        $clean['slug'] = blog_slugify($raw);
    }

    if (array_key_exists('featuredImage', $input)) {
        $image = trim((string)$input['featuredImage']);
        if ($image !== '' && blog_safe_image_src($image) === null) {
            error_response('Upload the featured image, or use an https image address.', 422, [
                'featuredImage' => 'That image address is not allowed.',
            ]);
        }
        $clean['featured_image'] = $image;
    }

    if (array_key_exists('featuredImageAlt', $input)) {
        $clean['featured_image_alt'] = clean_string($input['featuredImageAlt'], 300);
    }

    if (array_key_exists('contentHtml', $input)) {
        $raw = (string)$input['contentHtml'];
        if (mb_strlen($raw) > BLOG_CONTENT_MAX_CHARS) {
            error_response('That article is too long to store (limit ' . BLOG_CONTENT_MAX_CHARS . ' characters).', 422);
        }
        $clean['content_html'] = blog_sanitize_html($raw);
    }

    if (array_key_exists('categoryId', $input)) {
        $categoryId = trim((string)($input['categoryId'] ?? ''));
        if ($categoryId === '') {
            $clean['category_id'] = null;
        } else {
            if (blog_category_by_id($categoryId) === null) {
                error_response('That category no longer exists.', 422, ['categoryId' => 'Choose an existing category.']);
            }
            $clean['category_id'] = $categoryId;
        }
    }

    if (array_key_exists('tags', $input)) {
        $tags = blog_clean_tags($input['tags']);
        $clean['tags'] = implode(', ', $tags);
        $clean['tags_search'] = blog_tags_search($tags);
    }

    if (array_key_exists('seoTitle', $input)) {
        $clean['seo_title'] = clean_string($input['seoTitle'], 200);
    }
    if (array_key_exists('seoDescription', $input)) {
        $clean['seo_description'] = clean_string($input['seoDescription'], 320);
    }
    if (array_key_exists('isFeatured', $input)) {
        $clean['is_featured'] = !empty($input['isFeatured']) ? 1 : 0;
    }

    return $clean;
}

/** Create a draft. Publishing is a separate, explicit decision. */
function blog_create_post(array $input, array $actor): array
{
    $fields = blog_validate_post_input($input, true);
    $slug = blog_unique_slug((string)($fields['slug'] ?? '') ?: (string)$fields['title']);

    $id = new_id('blogpost');
    $now = db_now();
    db_exec(
        'INSERT INTO blog_posts
            (id, title, subtitle, slug, featured_image, featured_image_alt, content_html, category_id, tags,
             tags_search, author_user_id, author_name, status, publish_at, published_at, seo_title,
             seo_description, is_featured, created_at, updated_at)
         VALUES
            (:id, :title, :subtitle, :slug, :image, :image_alt, :content, :category, :tags,
             :tags_search, :author_id, :author_name, :status, NULL, NULL, :seo_title,
             :seo_description, :featured, :now, :now2)',
        [
            ':id'              => $id,
            ':title'           => (string)$fields['title'],
            ':subtitle'        => (string)($fields['subtitle'] ?? ''),
            ':slug'            => $slug,
            ':image'           => (string)($fields['featured_image'] ?? ''),
            ':image_alt'       => (string)($fields['featured_image_alt'] ?? ''),
            ':content'         => (string)($fields['content_html'] ?? ''),
            ':category'        => $fields['category_id'] ?? null,
            ':tags'            => (string)($fields['tags'] ?? ''),
            ':tags_search'     => (string)($fields['tags_search'] ?? ''),
            ':author_id'       => (string)$actor['id'],
            ':author_name'     => blog_clean_author_name($actor),
            ':status'          => 'draft',
            ':seo_title'       => (string)($fields['seo_title'] ?? ''),
            ':seo_description' => (string)($fields['seo_description'] ?? ''),
            ':featured'        => (int)($fields['is_featured'] ?? 0),
            ':now'             => $now,
            ':now2'            => $now,
        ]
    );
    audit_log('blog.post_created', 'blog_post', $id, ['slug' => $slug], $actor);

    return blog_post_by_id($id) ?? [];
}

/** Update the editable fields of a post. Status is never changed here. */
function blog_update_post(string $id, array $input, array $actor): array
{
    $row = blog_post_by_id($id);
    if ($row === null) {
        error_response('That article no longer exists.', 404);
    }

    $fields = blog_validate_post_input($input, false);
    if (array_key_exists('slug', $fields)) {
        $requested = (string)$fields['slug'];
        $fields['slug'] = $requested === ''
            ? blog_unique_slug((string)$row['title'], $id)
            : blog_unique_slug($requested, $id);
    }
    // The byline follows the account that last saved the article, so it always
    // names a real administrator.
    $fields['author_name'] = blog_clean_author_name($actor);
    $fields['author_user_id'] = (string)$actor['id'];

    $assignments = [];
    $params = [':id' => $id, ':now' => db_now()];
    foreach ($fields as $column => $value) {
        $assignments[] = $column . ' = :' . $column;
        $params[':' . $column] = $value;
    }
    if ($assignments === []) {
        return $row;
    }
    $assignments[] = 'updated_at = :now';
    db_exec('UPDATE blog_posts SET ' . implode(', ', $assignments) . ' WHERE id = :id', $params);
    audit_log('blog.post_updated', 'blog_post', $id, ['fields' => array_keys($fields)], $actor);

    return blog_post_by_id($id) ?? $row;
}

/**
 * Move a post between statuses.
 *
 * `scheduled` requires a future publication time; `published` publishes now;
 * `unpublished` withdraws it (the URL stops resolving immediately) and `draft`
 * returns it to the work-in-progress list.
 */
function blog_set_post_status(string $id, array $input, array $actor): array
{
    $row = blog_post_by_id($id);
    if ($row === null) {
        error_response('That article no longer exists.', 404);
    }

    $status = one_of($input['status'] ?? '', blog_statuses());
    if ($status === null) {
        error_response('Choose draft, scheduled, published or unpublished.', 422, [
            'status' => 'Choose a valid status.',
        ]);
    }

    $now = db_now();
    $publishAt = null;
    $publishedAt = $row['published_at'] ?? null;

    if ($status === 'scheduled') {
        $raw = trim((string)($input['publishAt'] ?? ''));
        $timestamp = $raw !== '' ? strtotime($raw) : false;
        if ($timestamp === false) {
            error_response('Choose the date and time this article should go live.', 422, [
                'publishAt' => 'Enter a publication date and time.',
            ]);
        }
        if ($timestamp <= time()) {
            error_response('A scheduled article must be set for a future time.', 422, [
                'publishAt' => 'Choose a time in the future.',
            ]);
        }
        $publishAt = gmdate('Y-m-d H:i:s', $timestamp);
    }

    if ($status === 'published') {
        // Publishing an article with nothing in it would put an empty page on
        // the site; refuse rather than publish a blank article.
        // An article with no words and no property cards would publish an empty
        // page. One or the other is enough: a showcase-only roundup is a real
        // article.
        $hasWords = trim(strip_tags((string)($row['content_html'] ?? ''))) !== '';
        $hasCards = blog_post_property_refs($id) !== [];
        if (!$hasWords && !$hasCards) {
            error_response('Add the article content before publishing.', 422, [
                'contentHtml' => 'This article has no content yet.',
            ]);
        }
        $publishAt = $now;
        if ($publishedAt === null) {
            $publishedAt = $now;
        }
    }

    if ($status === 'draft') {
        $publishAt = null;
    }

    db_exec(
        'UPDATE blog_posts
            SET status = :status, publish_at = :publish_at, published_at = :published_at, updated_at = :now
          WHERE id = :id',
        [
            ':status'       => $status,
            ':publish_at'   => $status === 'unpublished' ? null : $publishAt,
            ':published_at' => $publishedAt,
            ':now'          => $now,
            ':id'           => $id,
        ]
    );
    audit_log('blog.post_status_changed', 'blog_post', $id, [
        'from' => (string)$row['status'],
        'to'   => $status,
    ], $actor);

    return blog_post_by_id($id) ?? $row;
}

/**
 * Delete a post and its property references in one transaction.
 *
 * The article's URLs stop working immediately; nothing else is touched.
 */
function blog_delete_post(string $id, array $actor): void
{
    $row = blog_post_by_id($id);
    if ($row === null) {
        error_response('That article no longer exists.', 404);
    }

    db_transaction(function () use ($id): void {
        db_exec('DELETE FROM blog_post_properties WHERE post_id = :id', [':id' => $id]);
        db_exec('DELETE FROM blog_posts WHERE id = :id', [':id' => $id]);
    });
    audit_log('blog.post_deleted', 'blog_post', $id, ['slug' => (string)$row['slug']], $actor);
}

/* -------------------------------------------------------------------------- */
/* Property showcase references                                               */
/* -------------------------------------------------------------------------- */

/**
 * Replace the selected listings for a post.
 *
 * The whole list is written inside one transaction: the order the administrator
 * arranged is what a reader sees, and a half-written list can never be stored.
 * Property ids are validated against the real table, and duplicates collapse to
 * the first occurrence.
 */
function blog_set_post_properties(string $postId, array $items, array $actor): array
{
    $row = blog_post_by_id($postId);
    if ($row === null) {
        error_response('That article no longer exists.', 404);
    }
    if (count($items) > 60) {
        error_response('An article can show at most 60 listings.', 422);
    }

    $clean = [];
    $seen = [];
    foreach ($items as $item) {
        if (!is_array($item)) {
            continue;
        }
        $propertyId = trim((string)($item['propertyId'] ?? ''));
        if ($propertyId === '' || isset($seen[$propertyId])) {
            continue;
        }
        $property = db_one('SELECT id FROM properties WHERE id = :id', [':id' => $propertyId]);
        if ($property === null) {
            error_response('One of the selected listings no longer exists. Search again and re-add it.', 422, [
                'items' => 'A selected listing could not be found.',
            ]);
        }
        $seen[$propertyId] = true;
        $clean[] = [
            'propertyId'  => $propertyId,
            'displayRule' => one_of($item['displayRule'] ?? 'show_status', blog_display_rules(), 'show_status'),
            'note'        => clean_string($item['note'] ?? '', 300),
        ];
    }

    $now = db_now();
    db_transaction(function () use ($postId, $clean, $now): void {
        db_exec('DELETE FROM blog_post_properties WHERE post_id = :id', [':id' => $postId]);
        $order = 0;
        foreach ($clean as $item) {
            db_exec(
                'INSERT INTO blog_post_properties (id, post_id, property_id, sort_order, display_rule, note, created_at)
                 VALUES (:id, :post, :property, :sort, :rule, :note, :now)',
                [
                    ':id'       => new_id('blogref'),
                    ':post'     => $postId,
                    ':property' => $item['propertyId'],
                    ':sort'     => $order++,
                    ':rule'     => $item['displayRule'],
                    ':note'     => $item['note'],
                    ':now'      => $now,
                ]
            );
        }
    });
    audit_log('blog.post_properties_set', 'blog_post', $postId, ['count' => count($clean)], $actor);

    return $clean;
}

/** The stored references for a post, in the administrator's order. */
function blog_post_property_refs(string $postId): array
{
    return db_all(
        'SELECT * FROM blog_post_properties WHERE post_id = :id ORDER BY sort_order ASC, created_at ASC',
        [':id' => $postId]
    );
}

/**
 * Shape one listing for an article card, from its LIVE row.
 *
 * Only publicly displayable fields are returned: no landlord id, no contact, no
 * internal moderation state beyond whether the listing is available.
 */
function blog_shape_property_card(array $row, string $displayRule, string $note, int $sortOrder, bool $forAdmin = false): ?array
{
    $status = (string)($row['status'] ?? '');
    // A listing past its availability deadline is not available, even before
    // the scheduled job writes `expired`.
    $available = $status === 'active' && property_is_publicly_visible($row);
    if (!$forAdmin && !$available && $displayRule === 'hide_unavailable') {
        return null;
    }

    $images = json_column($row['images'] ?? null);
    $image = '';
    foreach ($images as $candidate) {
        if (is_string($candidate) && trim($candidate) !== '') {
            $image = $candidate;
            break;
        }
    }

    // A visitor never sees "pending" or "rejected": those are internal states.
    // What matters to a reader is simply whether the home can still be rented.
    $statusLabel = $available ? (string)($row['availability'] ?? 'Available Now') : 'No longer available';

    $card = [
        'propertyId'   => (string)$row['id'],
        'title'        => (string)$row['title'],
        'location'     => (string)$row['location'],
        'city'         => (string)($row['city'] ?? ''),
        'propertyType' => (string)$row['property_type'],
        'bedrooms'     => (int)$row['bedrooms'],
        'bathrooms'    => (int)$row['bathrooms'],
        'rentGhs'      => (float)$row['rent_ghs'],
        'image'        => $image,
        'imageAlt'     => trim((string)$row['title'] . ' in ' . (string)$row['location']),
        'availability' => $statusLabel,
        'isAvailable'  => $available,
        // Only an available listing has a page a visitor can open.
        'url'          => $available ? '/property/' . rawurlencode((string)$row['id']) : null,
        'displayRule'  => $displayRule,
        'note'         => $note,
        'sortOrder'    => $sortOrder,
        'updatedAt'    => to_iso($row['updated_at'] ?? null),
    ];
    if ($forAdmin) {
        $card['status'] = $status;
    }

    return $card;
}

/**
 * The live cards for a post.
 *
 * @return array<int, array<string, mixed>>
 */
function blog_post_property_cards(string $postId, bool $forAdmin = false): array
{
    $refs = blog_post_property_refs($postId);
    if ($refs === []) {
        return [];
    }

    $ids = array_map(static fn($ref) => (string)$ref['property_id'], $refs);
    $placeholders = [];
    $params = [];
    foreach ($ids as $index => $propertyId) {
        $placeholders[] = ':p' . $index;
        $params[':p' . $index] = $propertyId;
    }
    $rows = db_all('SELECT * FROM properties WHERE id IN (' . implode(', ', $placeholders) . ')', $params);
    $byId = [];
    foreach ($rows as $row) {
        $byId[(string)$row['id']] = $row;
    }

    $cards = [];
    foreach ($refs as $ref) {
        $propertyId = (string)$ref['property_id'];
        $rule = one_of($ref['display_rule'] ?? 'show_status', blog_display_rules(), 'show_status');
        $note = (string)($ref['note'] ?? '');
        $order = (int)$ref['sort_order'];

        if (!isset($byId[$propertyId])) {
            // The listing was deleted. Never present it as available; in the
            // editor say plainly that the reference is now dead.
            if ($forAdmin) {
                $cards[] = [
                    'propertyId'   => $propertyId,
                    'title'        => 'Listing no longer exists',
                    'location'     => '',
                    'city'         => '',
                    'propertyType' => '',
                    'bedrooms'     => 0,
                    'bathrooms'    => 0,
                    'rentGhs'      => 0,
                    'image'        => '',
                    'imageAlt'     => '',
                    'availability' => 'Deleted',
                    'isAvailable'  => false,
                    'url'          => null,
                    'displayRule'  => $rule,
                    'note'         => $note,
                    'sortOrder'    => $order,
                    'updatedAt'    => null,
                    'status'       => 'deleted',
                    'missing'      => true,
                ];
            }
            continue;
        }

        $card = blog_shape_property_card($byId[$propertyId], $rule, $note, $order, $forAdmin);
        if ($card !== null) {
            $cards[] = $card;
        }
    }

    return $cards;
}

/* -------------------------------------------------------------------------- */
/* Shaping and listing                                                        */
/* -------------------------------------------------------------------------- */

function blog_shape_post(array $row, bool $withContent = false): array
{
    $category = null;
    if (!empty($row['category_id'])) {
        $categoryRow = blog_category_by_id((string)$row['category_id']);
        if ($categoryRow !== null) {
            $category = blog_shape_category($categoryRow);
        }
    }

    $tags = array_values(array_filter(array_map('trim', explode(',', (string)($row['tags'] ?? ''))), static fn($t) => $t !== ''));

    $post = [
        'id'               => (string)$row['id'],
        'title'            => (string)$row['title'],
        'subtitle'         => (string)($row['subtitle'] ?? ''),
        'slug'             => (string)$row['slug'],
        'url'              => '/blog/' . (string)$row['slug'],
        'absoluteUrl'      => SITE_URL . '/blog/' . (string)$row['slug'],
        'featuredImage'    => (string)($row['featured_image'] ?? ''),
        'featuredImageAlt' => (string)($row['featured_image_alt'] ?? ''),
        'category'         => $category,
        'tags'             => $tags,
        'author'           => [
            'name' => (string)($row['author_name'] ?? ''),
        ],
        'status'           => (string)$row['status'],
        'isFeatured'       => (bool)($row['is_featured'] ?? false),
        'publishAt'        => to_iso($row['publish_at'] ?? null),
        'publishedAt'      => to_iso($row['published_at'] ?? null),
        'createdAt'        => to_iso($row['created_at'] ?? null),
        'updatedAt'        => to_iso($row['updated_at'] ?? null),
        'summary'          => blog_summary($row),
        'readingMinutes'   => blog_reading_minutes((string)($row['content_html'] ?? '')),
        'seoTitle'         => (string)($row['seo_title'] ?? ''),
        'seoDescription'   => (string)($row['seo_description'] ?? ''),
    ];

    if ($withContent) {
        $post['contentHtml'] = (string)($row['content_html'] ?? '');
    }

    return $post;
}

/**
 * Where clause fragments for the public list.
 *
 * @return array{where: string, params: array<string, string>}
 */
function blog_public_where(): array
{
    return ['where' => "status = 'published'", 'params' => []];
}

/**
 * Paged public listing.
 *
 * @param array{category?: string, tag?: string, q?: string, page?: int, perPage?: int} $filters
 * @return array{items: array<int, array<string, mixed>>, total: int}
 */
function blog_query_public_posts(array $filters): array
{
    blog_promote_due_posts();

    $where = ["p.status = 'published'"];
    $params = [];

    if (!empty($filters['category'])) {
        $category = blog_category_by_slug((string)$filters['category']);
        if ($category === null) {
            return ['items' => [], 'total' => 0];
        }
        $where[] = 'p.category_id = :category_id';
        $params[':category_id'] = (string)$category['id'];
    }
    if (!empty($filters['tag'])) {
        // `tags_search` stores the tags lower-cased and comma-padded, so this is
        // a plain LIKE that means "this exact tag" on both MySQL and SQLite.
        $where[] = 'p.tags_search LIKE :tag';
        $params[':tag'] = '%,' . trim(mb_strtolower((string)$filters['tag'])) . ',%';
    }
    if (!empty($filters['q'])) {
        $needle = '%' . mb_strtolower((string)$filters['q']) . '%';
        $where[] = '(LOWER(p.title) LIKE :q OR LOWER(p.subtitle) LIKE :q OR LOWER(COALESCE(p.content_html, \'\')) LIKE :q)';
        $params[':q'] = $needle;
    }

    $whereSql = implode(' AND ', $where);
    $total = (int)db_value('SELECT COUNT(*) FROM blog_posts p WHERE ' . $whereSql, $params);

    $perPage = max(1, min(24, (int)($filters['perPage'] ?? 9)));
    $page = max(1, (int)($filters['page'] ?? 1));
    $offset = ($page - 1) * $perPage;

    $rows = db_all(
        'SELECT p.* FROM blog_posts p WHERE ' . $whereSql
        . ' ORDER BY p.published_at DESC, p.created_at DESC LIMIT ' . $perPage . ' OFFSET ' . $offset,
        $params
    );

    return ['items' => array_map(static fn($row) => blog_shape_post($row), $rows), 'total' => $total];
}

/** Featured published posts for the blog home page. */
function blog_featured_posts(int $limit = 3): array
{
    blog_promote_due_posts();
    $rows = db_all(
        "SELECT * FROM blog_posts WHERE status = 'published' AND is_featured = 1
          ORDER BY published_at DESC, created_at DESC LIMIT " . max(1, min(6, $limit)),
        []
    );

    return array_map(static fn($row) => blog_shape_post($row), $rows);
}

/** Categories that have at least one published article, with their counts. */
function blog_public_categories(): array
{
    blog_promote_due_posts();
    $rows = db_all('SELECT * FROM blog_categories ORDER BY sort_order ASC, name ASC', []);
    $counts = [];
    foreach (db_all("SELECT category_id, COUNT(*) AS total FROM blog_posts WHERE status = 'published' GROUP BY category_id", []) as $row) {
        $counts[(string)($row['category_id'] ?? '')] = (int)$row['total'];
    }

    $out = [];
    foreach ($rows as $row) {
        $count = $counts[(string)$row['id']] ?? 0;
        if ($count <= 0) {
            continue;
        }
        $out[] = blog_shape_category($row, $count);
    }

    return $out;
}

/** Every category, including empty ones (admin). */
function blog_admin_categories(): array
{
    $rows = blog_category_rows();
    $counts = [];
    foreach (db_all('SELECT category_id, status, COUNT(*) AS total FROM blog_posts GROUP BY category_id, status', []) as $row) {
        $key = (string)($row['category_id'] ?? '');
        $counts[$key]['total'] = ($counts[$key]['total'] ?? 0) + (int)$row['total'];
        if ((string)$row['status'] === 'published') {
            $counts[$key]['published'] = (int)$row['total'];
        }
    }

    $out = [];
    foreach ($rows as $row) {
        $id = (string)$row['id'];
        $shape = blog_shape_category($row, $counts[$id]['published'] ?? 0);
        $shape['postCount'] = $counts[$id]['total'] ?? 0;
        $out[] = $shape;
    }

    return $out;
}

/**
 * Related articles: same category first, then the latest others.
 *
 * Only published posts, never the article being read.
 */
function blog_related_posts(array $post, int $limit = 3): array
{
    $categoryId = (string)($post['category_id'] ?? '');
    $id = (string)$post['id'];

    $rows = [];
    if ($categoryId !== '') {
        $rows = db_all(
            "SELECT * FROM blog_posts
              WHERE status = 'published' AND category_id = :category AND id <> :id
              ORDER BY published_at DESC LIMIT " . $limit,
            [':category' => $categoryId, ':id' => $id]
        );
    }
    if (count($rows) < $limit) {
        $exclude = [$id];
        foreach ($rows as $row) {
            $exclude[] = (string)$row['id'];
        }
        $placeholders = [];
        $params = [];
        foreach ($exclude as $index => $value) {
            $placeholders[] = ':x' . $index;
            $params[':x' . $index] = $value;
        }
        $more = db_all(
            "SELECT * FROM blog_posts
              WHERE status = 'published' AND id NOT IN (" . implode(', ', $placeholders) . ')
              ORDER BY published_at DESC LIMIT ' . max(0, $limit - count($rows)),
            $params
        );
        $rows = array_merge($rows, $more);
    }

    return array_map(static fn($row) => blog_shape_post($row), $rows);
}

/**
 * Admin listing, every status, with search and paging.
 *
 * @param array{status?: string, q?: string, category?: string, page?: int, perPage?: int} $filters
 */
function blog_query_admin_posts(array $filters): array
{
    $where = ['1 = 1'];
    $params = [];
    if (!empty($filters['status'])) {
        $status = one_of((string)$filters['status'], blog_statuses());
        if ($status !== null) {
            $where[] = 'p.status = :status';
            $params[':status'] = $status;
        }
    }
    if (!empty($filters['category'])) {
        $category = blog_category_by_slug((string)$filters['category']);
        if ($category !== null) {
            $where[] = 'p.category_id = :category';
            $params[':category'] = (string)$category['id'];
        }
    }
    if (!empty($filters['q'])) {
        $needle = '%' . mb_strtolower((string)$filters['q']) . '%';
        $where[] = '(LOWER(p.title) LIKE :q OR LOWER(p.slug) LIKE :q OR LOWER(p.subtitle) LIKE :q)';
        $params[':q'] = $needle;
    }

    $whereSql = ' WHERE ' . implode(' AND ', $where);
    $total = (int)db_value('SELECT COUNT(*) FROM blog_posts p' . $whereSql, $params);
    $perPage = max(1, min(100, (int)($filters['perPage'] ?? 25)));
    $page = max(1, (int)($filters['page'] ?? 1));
    $offset = ($page - 1) * $perPage;

    $rows = db_all(
        'SELECT p.* FROM blog_posts p' . $whereSql
        . ' ORDER BY p.created_at DESC LIMIT ' . $perPage . ' OFFSET ' . $offset,
        $params
    );

    return ['items' => array_map(static fn($row) => blog_shape_post($row), $rows), 'total' => $total];
}

/**
 * Property search for the article editor.
 *
 * Returns the same public fields a card shows, plus the status so the
 * administrator can see what they are choosing. Only ever called for an
 * administrator.
 */
function blog_search_properties(string $query, int $limit = 20): array
{
    $limit = max(1, min(50, $limit));
    $params = [];
    $where = '';
    if (trim($query) !== '') {
        $needle = '%' . mb_strtolower(trim($query)) . '%';
        $where = 'WHERE (LOWER(title) LIKE :q OR LOWER(location) LIKE :q OR LOWER(city) LIKE :q)';
        $params[':q'] = $needle;
    }

    $rows = db_all(
        'SELECT * FROM properties ' . $where . " ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END, updated_at DESC, created_at DESC LIMIT " . $limit,
        $params
    );

    $cards = [];
    foreach ($rows as $row) {
        $cards[] = blog_shape_property_card($row, 'show_status', '', 0, true);
    }

    return array_values(array_filter($cards));
}

/** Counts for the console's Blog Management header. */
function blog_admin_counts(): array
{
    blog_promote_due_posts();
    $counts = ['draft' => 0, 'scheduled' => 0, 'published' => 0, 'unpublished' => 0];
    foreach (db_all('SELECT status, COUNT(*) AS total FROM blog_posts GROUP BY status', []) as $row) {
        $status = (string)$row['status'];
        if (isset($counts[$status])) {
            $counts[$status] = (int)$row['total'];
        }
    }
    $counts['total'] = array_sum($counts);
    $counts['categories'] = (int)db_value('SELECT COUNT(*) FROM blog_categories');

    return $counts;
}
