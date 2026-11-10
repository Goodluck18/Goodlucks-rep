<?php
/**
 * Server-rendered article page entry point (Upgrade 2, A3).
 *
 * Why this file exists
 * --------------------
 * `/property/...` already answers with the listing's own metadata, so a shared
 * listing shows a real preview. Articles did not: `/blog/<slug>` fell through to
 * `index.html`, and WhatsApp, Facebook, X, LinkedIn and Slack showed the generic
 * site card for every article — no title, no photograph.
 *
 * Apache sends `/blog` and `/blog/<slug>` here (see `public/.htaccess`); the
 * development server's `router.php` mirrors those rules exactly so local
 * behaviour matches production.
 *
 *   1. `/blog`                    → the Learning Centre card (site-level).
 *   2. `/blog/<slug>`             → the article's own title, description,
 *                                   photograph, canonical URL, `og:type=article`
 *                                   and `Article` structured data.
 *   3. a slug in a different case is 301'd to the one canonical URL — the same
 *      rule as the property page — and the query string (utm_*, ?ref=…) is kept.
 *      A trailing slash is normalised by the shared path helper.
 *   4. a draft, a scheduled post, an unpublished post and a slug that never
 *      existed all answer 404 with the identical `noindex` page, so the response
 *      cannot be used to discover an unpublished article.
 *
 * The React application still boots and renders the full article for a human
 * visitor; nothing about the client-side experience changes.
 */

declare(strict_types=1);

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/lib/validate.php';
require_once __DIR__ . '/lib/blog_content.php';
require_once __DIR__ . '/lib/blog.php';
require_once __DIR__ . '/lib/property_url.php';
// The request/response helpers (path, send, redirect) shared with the property
// page and the short link. They are generic despite living in that file.
require_once __DIR__ . '/lib/property_serve.php';
require_once __DIR__ . '/lib/blog_serve.php';

$path = property_request_path();

/** Answer 404 with the one "not available" page, used for every reason. */
$notFound = static function (): void {
    property_send(blog_missing_meta_html(), 404);
};

// The Learning Centre index.
if ($path === '/blog') {
    $listing = blog_query_public_posts(['perPage' => 10]);
    $latest = [];
    foreach ($listing['items'] as $item) {
        $latest[] = ['title' => (string)$item['title'], 'url' => (string)$item['absoluteUrl']];
    }
    property_send(blog_index_meta_html($latest), 200);
    exit;
}

if (!preg_match('#^/blog/([^/]+)$#', $path, $matches)) {
    $notFound();
    exit;
}

$slug = (string)$matches[1];
$post = blog_public_post_by_slug($slug);

// A slug typed or shared in a different case still resolves: `blog_valid_slug()`
// only accepts lower case, so the lookup is retried lower-cased and the request
// is then redirected to the exact canonical URL.
if (!$post && $slug !== strtolower($slug)) {
    $post = blog_public_post_by_slug(strtolower($slug));
}

if (!$post) {
    $notFound();
    exit;
}

$canonicalPath = '/blog/' . (string)$post['slug'];

// A different case or an extra segment collapses onto the canonical URL. The
// redirect is relative so it keeps whichever host the visitor is using (the
// testing domain or the permanent one).
if ($path !== $canonicalPath) {
    property_redirect($canonicalPath);
    exit;
}

// The category name is used in `article:section` and in the structured data.
if (!empty($post['category_id'])) {
    $category = blog_category_by_id((string)$post['category_id']);
    if ($category !== null) {
        $post['category_name'] = (string)$category['name'];
    }
}

property_send(blog_share_meta_html($post), 200);
