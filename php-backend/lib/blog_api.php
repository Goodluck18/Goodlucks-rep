<?php
/**
 * Goodlucks Homes - Blog & Learning Centre endpoints
 *
 * Two very different audiences share this file, and they are kept apart on
 * purpose:
 *
 *   Public (`/blog`, `/blog/<slug>`, `/blog/categories`)
 *     Never returns a draft, a scheduled post before its time, or an
 *     unpublished one. The query itself filters on `status = 'published'`; there
 *     is no parameter that can widen it.
 *
 *   Administrator (`/admin/blog/...`)
 *     `require_admin()` on every handler, so a landlord, agent or tenant token
 *     cannot read a draft or change a status even if they know the id.
 */

declare(strict_types=1);

/* -------------------------------------------------------------------------- */
/* Public                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * GET /blog — the Learning Centre home.
 *
 * Returns the introduction blocks the page needs: categories with counts, the
 * featured articles, and the latest published articles (paged, filterable).
 */
function handle_blog_index(): void
{
    $page = max(1, (int)query_param('page', 1));
    $perPage = (int)query_param('perPage', 9);
    $filters = [
        'page'     => $page,
        'perPage'  => $perPage,
        'category' => (string)(query_param('category', '') ?? ''),
        'tag'      => (string)(query_param('tag', '') ?? ''),
        'q'        => (string)(query_param('q', '') ?? ''),
    ];

    $result = blog_query_public_posts($filters);
    $pages = $perPage > 0 ? (int)ceil($result['total'] / max(1, min(24, $perPage))) : 0;

    json_response([
        'success'    => true,
        'categories' => blog_public_categories(),
        // Featured articles are only worth showing on the unfiltered landing
        // view; with a filter the reader has already narrowed the list.
        'featured'   => ($filters['category'] === '' && $filters['tag'] === '' && $filters['q'] === '' && $page === 1)
            ? blog_featured_posts(3)
            : [],
        'posts'      => $result['items'],
        'pagination' => [
            'page'    => $page,
            'perPage' => max(1, min(24, $perPage)),
            'total'   => $result['total'],
            'pages'   => $pages,
        ],
    ]);
}

/** GET /blog/<slug> — one published article, with its live property cards. */
function handle_blog_post(array $params): void
{
    $slug = (string)($params[0] ?? '');
    $row = blog_public_post_by_slug($slug);
    if ($row === null) {
        // A draft and a non-existent article answer the same way: a visitor must
        // not be able to tell from the response that a draft exists.
        error_response('Article not found.', 404);
    }

    $post = blog_shape_post($row, true);
    $post['propertyCards'] = blog_post_property_cards((string)$row['id']);
    $post['related'] = blog_related_posts($row, 3);
    $post['showcasePlaceholder'] = blog_showcase_placeholder();
    $post['canonicalUrl'] = SITE_URL . '/blog/' . (string)$row['slug'];
    $post['breadcrumbs'] = [
        ['name' => 'Home', 'url' => SITE_URL . '/'],
        ['name' => 'Learning Centre', 'url' => SITE_URL . '/blog'],
    ];
    if ($post['category'] !== null) {
        $post['breadcrumbs'][] = [
            'name' => (string)$post['category']['name'],
            'url'  => SITE_URL . '/blog?category=' . rawurlencode((string)$post['category']['slug']),
        ];
    }

    json_response(['success' => true, 'post' => $post]);
}

/** GET /blog/categories — categories that have at least one published article. */
function handle_blog_categories(): void
{
    json_response(['success' => true, 'categories' => blog_public_categories()]);
}

/* -------------------------------------------------------------------------- */
/* Administrator — articles                                                   */
/* -------------------------------------------------------------------------- */

/** GET /admin/blog/posts — every status, for the console. */
function handle_admin_blog_posts(): void
{
    require_admin();
    $result = blog_query_admin_posts([
        'status'   => (string)(query_param('status', '') ?? ''),
        'category' => (string)(query_param('category', '') ?? ''),
        'q'        => (string)(query_param('q', '') ?? ''),
        'page'     => max(1, (int)query_param('page', 1)),
        'perPage'  => (int)query_param('perPage', 25),
    ]);

    json_response([
        'success'    => true,
        'posts'      => $result['items'],
        'total'      => $result['total'],
        'counts'     => blog_admin_counts(),
        'categories' => blog_admin_categories(),
    ]);
}

/** POST /admin/blog/posts — create a draft. */
function handle_admin_blog_create_post(): void
{
    $actor = require_admin();
    $input = request_json();
    $row = blog_create_post($input, $actor);

    json_response([
        'success' => true,
        'message' => 'Draft saved. It is not visible on the website until you publish it.',
        'post'    => blog_shape_post($row, true),
    ], 201);
}

/** GET /admin/blog/posts/<id> — the editor payload, drafts included. */
function handle_admin_blog_post_show(array $params): void
{
    require_admin();
    $row = blog_post_by_id((string)($params[0] ?? ''));
    if ($row === null) {
        error_response('That article no longer exists.', 404);
    }

    $post = blog_shape_post($row, true);
    $post['contentHtml'] = (string)($row['content_html'] ?? '');
    $post['propertyCards'] = blog_post_property_cards((string)$row['id'], true);
    $post['showcasePlaceholder'] = blog_showcase_placeholder();
    $post['publicUrl'] = SITE_URL . '/blog/' . (string)$row['slug'];

    json_response(['success' => true, 'post' => $post]);
}

/** PATCH /admin/blog/posts/<id> — edit fields. Never changes the status. */
function handle_admin_blog_update_post(array $params): void
{
    $actor = require_admin();
    $input = request_json();
    $row = blog_update_post((string)($params[0] ?? ''), $input, $actor);

    json_response([
        'success' => true,
        'message' => 'Article saved.',
        'post'    => blog_shape_post($row, true),
    ]);
}

/** POST /admin/blog/posts/<id>/status — publish, schedule, unpublish, draft. */
function handle_admin_blog_post_status(array $params): void
{
    $actor = require_admin();
    $input = request_json();
    $row = blog_set_post_status((string)($params[0] ?? ''), $input, $actor);
    $status = (string)$row['status'];

    $messages = [
        'published'   => 'Article published. It is live on the Learning Centre now.',
        'scheduled'   => 'Article scheduled. It will become public at '
            . (string)($row['publish_at'] ?? '') . ' UTC.',
        'unpublished' => 'Article unpublished. Its page no longer resolves and it is out of the sitemap.',
        'draft'       => 'Article moved back to drafts. It is not public.',
    ];

    json_response([
        'success' => true,
        'message' => $messages[$status] ?? 'Article updated.',
        'post'    => blog_shape_post($row, true),
    ]);
}

/**
 * DELETE /admin/blog/posts/<id>?confirm=1
 *
 * Deleting an article is irreversible, so the caller has to say so explicitly.
 */
function handle_admin_blog_delete_post(array $params): void
{
    $actor = require_admin();
    $confirm = (string)(query_param('confirm', '') ?? '');
    if ($confirm !== '1' && $confirm !== 'true') {
        error_response('Confirm the deletion first: this removes the article permanently.', 400, [
            'confirm' => 'Send confirm=1 to delete.',
        ]);
    }
    blog_delete_post((string)($params[0] ?? ''), $actor);

    json_response(['success' => true, 'message' => 'Article deleted.']);
}

/** POST /admin/blog/posts/<id>/properties — replace the showcased listings. */
function handle_admin_blog_post_properties(array $params): void
{
    $actor = require_admin();
    $input = request_json();
    $items = is_array($input['items'] ?? null) ? $input['items'] : [];
    blog_set_post_properties((string)($params[0] ?? ''), $items, $actor);

    $postId = (string)($params[0] ?? '');
    json_response([
        'success' => true,
        'message' => 'Showcase updated. The cards read the live listings every time the article is opened.',
        'propertyCards' => blog_post_property_cards($postId, true),
    ]);
}

/** GET /admin/blog/properties?q= — search the real catalogue for the editor. */
function handle_admin_blog_property_search(): void
{
    require_admin();
    $query = (string)(query_param('q', '') ?? '');

    json_response([
        'success'    => true,
        'properties' => blog_search_properties($query, (int)query_param('limit', 20)),
    ]);
}

/* -------------------------------------------------------------------------- */
/* Administrator — categories                                                 */
/* -------------------------------------------------------------------------- */

function handle_admin_blog_categories(): void
{
    require_admin();
    json_response([
        'success'    => true,
        'categories' => blog_admin_categories(),
    ]);
}

function handle_admin_blog_create_category(): void
{
    $actor = require_admin();
    $category = blog_create_category(request_json(), $actor);

    json_response(['success' => true, 'message' => 'Category created.', 'category' => $category], 201);
}

function handle_admin_blog_update_category(array $params): void
{
    $actor = require_admin();
    $category = blog_update_category((string)($params[0] ?? ''), request_json(), $actor);

    json_response(['success' => true, 'message' => 'Category saved.', 'category' => $category]);
}

function handle_admin_blog_delete_category(array $params): void
{
    $actor = require_admin();
    $confirm = (string)(query_param('confirm', '') ?? '');
    if ($confirm !== '1' && $confirm !== 'true') {
        error_response('Confirm the deletion first.', 400, ['confirm' => 'Send confirm=1 to delete.']);
    }
    blog_delete_category((string)($params[0] ?? ''), $actor);

    json_response(['success' => true, 'message' => 'Category deleted.']);
}

/* -------------------------------------------------------------------------- */
/* Administrator — email templates                                            */
/* -------------------------------------------------------------------------- */

function handle_admin_email_templates(): void
{
    require_admin();
    $targets = [];
    foreach (email_template_targets() as $type => $label) {
        $targets[] = ['type' => $type, 'label' => $label];
    }

    json_response([
        'success'   => true,
        'templates' => email_template_all(),
        'targets'   => $targets,
    ]);
}

function handle_admin_email_template_create(): void
{
    $actor = require_admin();
    $template = email_template_create(request_json(), $actor);

    json_response([
        'success'  => true,
        'message'  => 'Template saved. It is added to the end of that email from now on.',
        'template' => $template,
    ], 201);
}

function handle_admin_email_template_update(array $params): void
{
    $actor = require_admin();
    $template = email_template_update((string)($params[0] ?? ''), request_json(), $actor);

    json_response(['success' => true, 'message' => 'Template saved.', 'template' => $template]);
}

function handle_admin_email_template_delete(array $params): void
{
    $actor = require_admin();
    $confirm = (string)(query_param('confirm', '') ?? '');
    if ($confirm !== '1' && $confirm !== 'true') {
        error_response('Confirm the deletion first.', 400, ['confirm' => 'Send confirm=1 to delete.']);
    }
    email_template_delete((string)($params[0] ?? ''), $actor);

    json_response(['success' => true, 'message' => 'Template deleted. The email itself is unchanged.']);
}

/**
 * POST /admin/email-templates/check-links
 *
 * Lets the editor warn about a dead article link while the administrator is
 * still typing, instead of only when they save.
 */
function handle_admin_email_template_check_links(): void
{
    require_admin();
    $input = request_json();
    $html = blog_sanitize_html((string)($input['html'] ?? $input['bodyHtml'] ?? ''), ['allow_media' => false]);
    $report = email_template_link_report($html);

    json_response([
        'success'    => true,
        'links'      => $report,
        'broken'     => email_template_broken_links($report),
        'html'       => $html,
    ]);
}

/**
 * GET /admin/blog/published-for-links?q=
 *
 * The "Insert Blog Post" picker: published articles only. Drafts are not in the
 * list at all, so an administrator cannot insert a link that would not resolve.
 */
function handle_admin_blog_published_for_links(): void
{
    require_admin();
    blog_promote_due_posts();
    $query = trim((string)(query_param('q', '') ?? ''));
    $params = [];
    $where = "status = 'published'";
    if ($query !== '') {
        $where .= ' AND (LOWER(title) LIKE :q OR LOWER(slug) LIKE :q)';
        $params[':q'] = '%' . mb_strtolower($query) . '%';
    }
    $rows = db_all('SELECT * FROM blog_posts WHERE ' . $where . ' ORDER BY published_at DESC LIMIT 50', $params);

    $posts = [];
    foreach ($rows as $row) {
        $posts[] = [
            'id'          => (string)$row['id'],
            'title'       => (string)$row['title'],
            'slug'        => (string)$row['slug'],
            'url'         => SITE_URL . '/blog/' . (string)$row['slug'],
            'publishedAt' => to_iso($row['published_at'] ?? null),
        ];
    }

    json_response(['success' => true, 'posts' => $posts]);
}
