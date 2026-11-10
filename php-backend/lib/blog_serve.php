<?php
/**
 * Goodlucks Homes - Article share metadata (server-rendered)
 *
 * Why this file exists (Upgrade 2, A3)
 * ------------------------------------
 * Listing pages already answer with the listing's own title, price, photograph
 * and canonical URL in the initial HTML (`lib/property_url.php` +
 * `property_page.php`), because WhatsApp, Facebook, X, LinkedIn, Slack and
 * search crawlers do not run the single-page app's JavaScript.
 *
 * Articles had no equivalent: `/blog/<slug>` fell through every rewrite rule to
 * `index.html`, so every article was shared as the generic site card ("Goodlucks
 * Homes - Rentals & Real Estate in Accra", no image, no title). Pasting an
 * article into WhatsApp produced a preview of the home page.
 *
 * This file builds the same kind of `<head>` block for an article, and for the
 * Learning Centre index. Only PUBLISHED articles get a real card: a draft, a
 * scheduled post and a slug that never existed all answer with the identical
 * "not available" response and a `noindex` instruction, so the response cannot
 * be used to discover an unpublished article.
 *
 * Nothing here reads a user record. An article has an author's display name
 * (already public as the byline) and no tenant or provider contact data, so no
 * private information can reach a share card.
 */

declare(strict_types=1);

/** The site name used in every share card. */
const BLOG_SITE_NAME = 'Goodlucks Homes';

/** Absolute canonical URL of an article. */
function blog_share_url(array $row): string
{
    return SITE_URL . '/blog/' . rawurlencode((string)($row['slug'] ?? ''));
}

/** Absolute canonical URL of the Learning Centre index. */
function blog_index_url(): string
{
    return SITE_URL . '/blog';
}

/**
 * The article's share image, or the site default.
 *
 * A featured image may be an absolute URL (an externally hosted picture) or a
 * path this site uploaded (`/api/uploads/…`). Anything that is not a plausible
 * image URL — a `javascript:`/`data:` string, a traversal attempt, a protocol
 * relative `//host` — is skipped in favour of the site's own card rather than
 * emitted as a broken preview.
 */
function blog_share_image(array $row): string
{
    $candidate = trim((string)($row['featured_image'] ?? ''));
    if ($candidate !== '') {
        if (preg_match('#^https?://#i', $candidate)) {
            return $candidate;
        }
        if (!str_starts_with($candidate, '//')
            && !str_contains($candidate, '..')
            && !preg_match('#^[a-z][a-z0-9+.-]*:#i', $candidate)) {
            return SITE_URL . '/' . ltrim($candidate, '/');
        }
    }

    return SITE_URL . '/og-image.jpg';
}

/**
 * The description a share card shows.
 *
 * The author's own SEO description wins (that is what they wrote it for), then
 * the subtitle, then the opening of the article. Never invented text.
 */
function blog_share_description(array $row): string
{
    $seo = trim((string)($row['seo_description'] ?? ''));
    if ($seo !== '') {
        return $seo;
    }

    $subtitle = trim((string)($row['subtitle'] ?? ''));
    if ($subtitle !== '') {
        return $subtitle;
    }

    return blog_plain_text((string)($row['content_html'] ?? ''), 200);
}

/** The `<title>` of an article page: the SEO title when the author wrote one. */
function blog_share_title(array $row): string
{
    $seo = trim((string)($row['seo_title'] ?? ''));
    if ($seo !== '') {
        return $seo;
    }

    $title = trim((string)($row['title'] ?? ''));

    return $title !== '' ? $title : 'Article';
}

/** An ISO-8601 timestamp for the article, or '' when it has no such date. */
function blog_iso_date($value): string
{
    $raw = trim((string)$value);
    if ($raw === '') {
        return '';
    }
    $timestamp = strtotime($raw);
    if ($timestamp === false) {
        return '';
    }

    return gmdate('c', $timestamp);
}

/**
 * JSON-LD for an article.
 *
 * Structured data is a best-effort description of the page's own content, not a
 * ranking promise: it names the article, its date, its author's byline and the
 * publisher. Every value comes from the stored article.
 */
function blog_article_json_ld(array $row, string $image, string $description): string
{
    $data = [
        '@context'      => 'https://schema.org',
        '@type'         => 'Article',
        'headline'      => blog_share_title($row),
        'description'   => $description,
        'image'         => [$image],
        'mainEntityOfPage' => ['@type' => 'WebPage', '@id' => blog_share_url($row)],
        'publisher'     => [
            '@type' => 'Organization',
            'name'  => BLOG_SITE_NAME,
            'url'   => SITE_URL,
        ],
    ];

    $published = blog_iso_date($row['published_at'] ?? '');
    if ($published !== '') {
        $data['datePublished'] = $published;
    }
    $modified = blog_iso_date($row['updated_at'] ?? '');
    if ($modified !== '') {
        $data['dateModified'] = $modified;
    }
    $author = trim((string)($row['author_name'] ?? ''));
    if ($author !== '') {
        $data['author'] = ['@type' => 'Person', 'name' => $author];
    }
    $category = trim((string)($row['category_name'] ?? ''));
    if ($category !== '') {
        $data['articleSection'] = $category;
    }

    return blog_json_ld_script($data);
}

/** Encode a JSON-LD payload for a `<script>` block, safely. */
function blog_json_ld_script(array $data): string
{
    $json = json_encode(
        $data,
        JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT
    );

    return '<script type="application/ld+json">' . ($json === false ? '{}' : $json) . '</script>';
}

/** The full `<head>` block for one published article. */
function blog_share_meta_html(array $row): string
{
    $title = blog_share_title($row) . ' | ' . BLOG_SITE_NAME;
    $description = blog_share_description($row);
    $url = blog_share_url($row);
    $image = blog_share_image($row);
    $imageAlt = trim((string)($row['featured_image_alt'] ?? ''));
    if ($imageAlt === '') {
        $imageAlt = blog_share_title($row);
    }

    $tags = [
        '<title>' . e($title) . '</title>',
        '<meta name="description" content="' . e($description) . '" />',
        '<meta name="robots" content="index, follow" />',
        '<link rel="canonical" href="' . e($url) . '" />',
        '<meta property="og:type" content="article" />',
        '<meta property="og:site_name" content="' . e(BLOG_SITE_NAME) . '" />',
        '<meta property="og:locale" content="en_GH" />',
        '<meta property="og:title" content="' . e(blog_share_title($row)) . '" />',
        '<meta property="og:description" content="' . e($description) . '" />',
        '<meta property="og:url" content="' . e($url) . '" />',
        '<meta property="og:image" content="' . e($image) . '" />',
        '<meta property="og:image:alt" content="' . e($imageAlt) . '" />',
        '<meta name="twitter:card" content="summary_large_image" />',
        '<meta name="twitter:title" content="' . e(blog_share_title($row)) . '" />',
        '<meta name="twitter:description" content="' . e($description) . '" />',
        '<meta name="twitter:image" content="' . e($image) . '" />',
    ];

    $published = blog_iso_date($row['published_at'] ?? '');
    if ($published !== '') {
        $tags[] = '<meta property="article:published_time" content="' . e($published) . '" />';
    }
    $modified = blog_iso_date($row['updated_at'] ?? '');
    if ($modified !== '') {
        $tags[] = '<meta property="article:modified_time" content="' . e($modified) . '" />';
    }
    $category = trim((string)($row['category_name'] ?? ''));
    if ($category !== '') {
        $tags[] = '<meta property="article:section" content="' . e($category) . '" />';
    }

    $tags[] = blog_article_json_ld($row, $image, $description);

    return implode("\n    ", $tags);
}

/**
 * The `<head>` block for the Learning Centre index.
 *
 * The index carries the same site card a visitor would expect from `/blog`, plus
 * a schema.org list of the newest published article titles. Nothing is claimed
 * about how many articles exist beyond what the list actually contains.
 *
 * @param array<int, array{title: string, url: string}> $latest
 */
function blog_index_meta_html(array $latest = []): string
{
    $title = 'Learning Centre — renting in Ghana, explained | ' . BLOG_SITE_NAME;
    $description = 'Guides to renting in Accra and Ghana: what a viewing fee covers, how to spot a scam, '
        . 'what a tenancy agreement should say, and how to move in without surprises.';

    $tags = [
        '<title>' . e($title) . '</title>',
        '<meta name="description" content="' . e($description) . '" />',
        '<meta name="robots" content="index, follow" />',
        '<link rel="canonical" href="' . e(blog_index_url()) . '" />',
        '<meta property="og:type" content="website" />',
        '<meta property="og:site_name" content="' . e(BLOG_SITE_NAME) . '" />',
        '<meta property="og:locale" content="en_GH" />',
        '<meta property="og:title" content="Learning Centre | ' . e(BLOG_SITE_NAME) . '" />',
        '<meta property="og:description" content="' . e($description) . '" />',
        '<meta property="og:url" content="' . e(blog_index_url()) . '" />',
        '<meta property="og:image" content="' . e(SITE_URL . '/og-image.jpg') . '" />',
        '<meta name="twitter:card" content="summary_large_image" />',
        '<meta name="twitter:title" content="Learning Centre | ' . e(BLOG_SITE_NAME) . '" />',
        '<meta name="twitter:description" content="' . e($description) . '" />',
        '<meta name="twitter:image" content="' . e(SITE_URL . '/og-image.jpg') . '" />',
    ];

    if ($latest !== []) {
        $items = [];
        foreach (array_values($latest) as $index => $post) {
            $items[] = [
                '@type'    => 'ListItem',
                'position' => $index + 1,
                'name'     => (string)$post['title'],
                'url'      => (string)$post['url'],
            ];
        }
        $tags[] = blog_json_ld_script([
            '@context'   => 'https://schema.org',
            '@type'      => 'CollectionPage',
            'name'       => 'Learning Centre',
            'url'        => blog_index_url(),
            'description' => $description,
            'isPartOf'   => ['@type' => 'WebSite', 'name' => BLOG_SITE_NAME, 'url' => SITE_URL],
            'mainEntity' => [
                '@type'           => 'ItemList',
                'itemListElement' => $items,
            ],
        ]);
    }

    return implode("\n    ", $tags);
}

/**
 * The `<head>` block for a missing, draft or unpublished article.
 *
 * Identical for every reason, so the response cannot distinguish "never existed"
 * from "written but not published".
 */
function blog_missing_meta_html(): string
{
    $description = 'This article is not available. Read current renting guides in the Goodlucks Homes Learning Centre.';

    return implode("\n    ", [
        '<title>Article not available | ' . e(BLOG_SITE_NAME) . '</title>',
        '<meta name="robots" content="noindex, follow" />',
        '<meta name="description" content="' . e($description) . '" />',
        '<meta property="og:type" content="website" />',
        '<meta property="og:site_name" content="' . e(BLOG_SITE_NAME) . '" />',
        '<meta property="og:title" content="Article not available | ' . e(BLOG_SITE_NAME) . '" />',
        '<meta property="og:description" content="' . e($description) . '" />',
        '<meta property="og:url" content="' . e(blog_index_url()) . '" />',
        '<meta property="og:image" content="' . e(SITE_URL . '/og-image.jpg') . '" />',
        '<meta name="twitter:card" content="summary_large_image" />',
        '<meta name="twitter:title" content="Article not available | ' . e(BLOG_SITE_NAME) . '" />',
        '<meta name="twitter:description" content="' . e($description) . '" />',
        '<meta name="twitter:image" content="' . e(SITE_URL . '/og-image.jpg') . '" />',
    ]);
}
