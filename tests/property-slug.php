<?php
/**
 * Print the server's property slug / share metadata for fixtures.
 *
 * Used by tests/property-seo.test.mts to prove that the PHP implementation (the
 * one that renders the initial HTML and the sitemap) and the TypeScript
 * implementation (the one the browser uses to build links and share text)
 * produce byte-identical output. If someone changes one side only, that parity
 * test fails.
 *
 *   php tests/property-slug.php <fixtures.json>
 *
 * Input:  [{"id":"prop-1","title":"…","location":"…","city":"…","rent_ghs":6500,"images":["…"]}]
 * Output: [{"id":…,"slug":…,"path":…,"url":…,"description":…,"image":…}]
 */

declare(strict_types=1);

require_once __DIR__ . '/../php-backend/config.php';

$path = $argv[1] ?? '';
if ($path === '' || !is_file($path)) {
    fwrite(STDERR, "Usage: property-slug.php <fixtures.json>\n");
    exit(1);
}

$rows = json_decode((string)file_get_contents($path), true);
if (!is_array($rows)) {
    fwrite(STDERR, "Fixtures must be a JSON array.\n");
    exit(1);
}

$out = [];
foreach ($rows as $row) {
    $out[] = [
        'id'          => (string)($row['id'] ?? ''),
        'slug'        => property_slug($row),
        'path'        => property_path($row),
        'url'         => property_canonical_url($row),
        'description' => property_share_description($row),
        'image'       => property_main_image_url($row),
        'title'       => property_share_meta($row)['title'],
    ];
}

echo json_encode($out, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
