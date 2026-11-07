<?php
/**
 * Property URLs, social-sharing metadata and the property page shell.
 *
 * A property has one public URL shape:
 *
 *     /property/{title}-{location}-{id}
 *
 * e.g. /property/3-bedroom-apartment-east-legon-prop-1
 *
 * The trailing segment is the property's **stable id**, which is what the
 * database, the API and every internal link use to identify the listing. The
 * words in front of it are decoration for humans and search engines: if the
 * title or location changes, the slug changes and the old URL is redirected
 * (301) to the new one, because the id at the end never moves.
 *
 * This module is the server-side single source of truth. Two other places must
 * agree with it exactly:
 *
 *   - `src/routing/propertyUrl.ts` (the browser's copy, so a link is built the
 *     same way on both sides), and
 *   - `tests/property-seo.test.mjs`, which asserts the two implementations
 *     produce identical slugs for the same fixtures.
 *
 * Nothing here touches the database schema: the slug is derived from columns
 * that already exist (`title`, `location`, `id`).
 */

/**
 * Accented Latin characters → their base letter.
 *
 * Deliberately a fixed map: it produces the same result on every host and
 * matches `slugify()` in `src/routing/propertyUrl.ts` (Unicode NFD + strip).
 */
const PROPERTY_SLUG_ACCENTS = [
    'à' => 'a', 'á' => 'a', 'â' => 'a', 'ã' => 'a', 'ä' => 'a', 'å' => 'a', 'ā' => 'a',
    'ç' => 'c', 'ć' => 'c', 'č' => 'c',
    'è' => 'e', 'é' => 'e', 'ê' => 'e', 'ë' => 'e', 'ē' => 'e', 'ę' => 'e',
    'ì' => 'i', 'í' => 'i', 'î' => 'i', 'ï' => 'i', 'ī' => 'i',
    'ñ' => 'n', 'ń' => 'n',
    'ò' => 'o', 'ó' => 'o', 'ô' => 'o', 'õ' => 'o', 'ö' => 'o', 'ø' => 'o', 'ō' => 'o',
    'ß' => 'ss',
    'ù' => 'u', 'ú' => 'u', 'û' => 'u', 'ü' => 'u', 'ū' => 'u',
    'ý' => 'y', 'ÿ' => 'y',
    'À' => 'A', 'Á' => 'A', 'Â' => 'A', 'Ã' => 'A', 'Ä' => 'A', 'Å' => 'A', 'Ā' => 'A',
    'Ç' => 'C', 'Ć' => 'C', 'Č' => 'C',
    'È' => 'E', 'É' => 'E', 'Ê' => 'E', 'Ë' => 'E', 'Ē' => 'E', 'Ę' => 'E',
    'Ì' => 'I', 'Í' => 'I', 'Î' => 'I', 'Ï' => 'I', 'Ī' => 'I',
    'Ñ' => 'N'
    , 'Ń' => 'N',
    'Ò' => 'O', 'Ó' => 'O', 'Ô' => 'O', 'Õ' => 'O', 'Ö' => 'O', 'Ø' => 'O', 'Ō' => 'O',
    'Ù' => 'U', 'Ú' => 'U', 'Û' => 'U', 'Ü' => 'U', 'Ū' => 'U',
    'Ý' => 'Y', 'Ÿ' => 'Y',
];

/**
 * Payment-period labels.
 *
 * The catalogue stores one figure per listing (`rent_ghs`) and, today, that
 * figure is always a **monthly** rent — which is why `month` is the default. A
 * record that carries its own `rent_period` (yearly, weekly, daily) is labelled
 * with that period instead of being called monthly. `src/routing/propertyUrl.ts`
 * mirrors this map.
 */
const PROPERTY_RENT_PERIOD_SUFFIX = [
    'month' => '/month',
    'year'  => '/year',
    'week'  => '/week',
    'day'   => '/day',
];

/** Words that add nothing to a URL and are dropped from the title slug. */
const PROPERTY_SLUG_STOPWORDS = ['a', 'an', 'and', 'at', 'for', 'in', 'of', 'on', 'the', 'to', 'with'];

/**
 * Lowercase, hyphenated, ASCII-safe form of a piece of text.
 *
 * Accents are transliterated where the platform can (`iconv`), every run of
 * other characters becomes a single hyphen, and leading/trailing hyphens are
 * trimmed so a slug never starts or ends with one.
 */
function property_slugify(string $text): string
{
    $text = trim($text);
    if ($text === '') {
        return '';
    }
    // Explicit transliteration rather than iconv: `ASCII//TRANSLIT` is
    // platform-dependent and emits quotes for accented vowels (`Caf'é`), which
    // would produce a different slug on the server than in the browser. This map
    // matches the browser's Unicode NFD + diacritic strip exactly.
    $text = strtr($text, PROPERTY_SLUG_ACCENTS);
    $text = strtolower($text);
    // Ampersands read better as "and" than as a dropped character.
    $text = str_replace('&', ' and ', $text);
    $text = preg_replace('/[^a-z0-9]+/', '-', $text) ?? '';
    $text = preg_replace('/-{2,}/', '-', $text) ?? '';
    return trim($text, '-');
}

/** True when `$needle` appears in `$haystack` as whole hyphen-separated words. */
function property_slug_contains(string $haystack, string $needle): bool
{
    if ($needle === '' || $haystack === '') {
        return false;
    }
    return str_contains('-' . $haystack . '-', '-' . $needle . '-');
}

/**
 * The descriptive slug for a property row (without a leading slash).
 *
 * @param array $row A property row (or a shaped property with the same keys).
 */
function property_slug(array $row): string
{
    $id = (string)($row['id'] ?? '');
    $title = (string)($row['title'] ?? '');
    $location = (string)($row['location'] ?? '');

    $titleWords = [];
    foreach (explode('-', property_slugify($title)) as $word) {
        if ($word === '' || in_array($word, PROPERTY_SLUG_STOPWORDS, true)) {
            continue;
        }
        $titleWords[] = $word;
    }
    $titleSlug = implode('-', $titleWords);
    if ($titleSlug === '') {
        $titleSlug = 'property';
    }

    $locationSlug = property_slugify($location);
    if ($locationSlug !== '' && !property_slug_contains($titleSlug, $locationSlug)) {
        $titleSlug .= '-' . $locationSlug;
    }

    $idSlug = property_slugify($id);
    if ($idSlug === '') {
        // An id made entirely of symbols cannot happen, but never emit a URL
        // that ends in a hyphen if it somehow does.
        return $titleSlug;
    }

    return $titleSlug . '-' . $idSlug;
}

/** The site-relative path of a property (`/property/{slug}`). */
function property_path(array $row): string
{
    return '/property/' . property_slug($row);
}

/** The absolute canonical URL of a property, built from the configured site URL. */
function property_canonical_url(array $row): string
{
    return SITE_URL . property_path($row);
}

/**
 * Resolve a `/property/<segment>` segment to a real property row.
 *
 * The segment is either the stable id (`prop-1`) or a slug ending in that id
 * (`3-bedroom-apartment-east-legon-prop-1`). Only the *end* of the segment is
 * considered, so an id that happens to appear in the middle of a title cannot
 * hijack another listing. The longest matching id wins, which keeps ids such as
 * `prop-1` and `prop-10` apart.
 */
/**
 * The short, permanent sharing address of a listing: `/p/{id}`.
 *
 * The id is the property's own stable public identifier — the value already at
 * the end of the canonical slug. Reusing it rather than minting a second code is
 * what keeps the short link valid through a retitle, a price change or a
 * location correction, needs no extra column and no migration, and cannot drift
 * out of sync with the row it points at. `src/routing/propertyUrl.ts` builds the
 * identical path, and `api/short_link.php` resolves it with the same visibility
 * rule as the property page itself.
 */
function property_short_path(array $row): string
{
    return '/p/' . rawurlencode((string)($row['id'] ?? ''));
}

/** The absolute short sharing URL of a listing. */
function property_short_url(array $row): string
{
    return SITE_URL . property_short_path($row);
}

/**
 * The listing a `/p/<code>` link points at, or null.
 *
 * Deliberately just a row lookup: the code *is* the id, so there is no second
 * index to keep in step, and an unpublished or deleted listing is filtered by
 * the caller exactly as it is for the canonical page.
 */
function property_resolve_short_code(string $code): ?array
{
    $code = trim(rawurldecode($code));
    if ($code === '' || !preg_match('#^[A-Za-z0-9_-]{1,120}$#', $code)) {
        return null;
    }
    $row = find_property($code);
    return $row ?: null;
}

function property_resolve_segment(string $segment): ?array
{
    $segment = trim($segment);
    if ($segment === '') {
        return null;
    }

    $exact = find_property($segment);
    if ($exact) {
        return $exact;
    }

    // Ids only — deliberately not the whole row, so this stays cheap.
    $ids = [];
    foreach (db_all('SELECT id FROM properties') as $row) {
        $ids[] = (string)$row['id'];
    }
    // Longest first: `prop-10` must win over `prop-1` when both would match.
    usort($ids, static fn (string $a, string $b): int => strlen($b) <=> strlen($a));

    foreach ($ids as $id) {
        if (property_slugify($id) === property_slugify($segment)) {
            return find_property($id);
        }
        if (str_ends_with($segment, '-' . $id)) {
            return find_property($id);
        }
    }

    return null;
}

/** True when a listing is public (published) and may be previewed by a crawler. */
function property_is_public(array $row): bool
{
    return in_array((string)($row['status'] ?? ''), ['active', 'rented'], true);
}

/** The money label used in share previews and link text: `GH₵ 6,500`. */
function property_money_label(float $amount): string
{
    $rounded = round($amount, 2);
    if (abs($rounded - round($rounded)) < 0.005) {
        return 'GH₵ ' . number_format($rounded, 0, '.', ',');
    }
    return 'GH₵ ' . number_format($rounded, 2, '.', ',');
}

/**
 * The payment period a property's rent is quoted in.
 *
 * Every rent on the platform is a monthly rent (`properties.rent_ghs`), which
 * is what the listing cards, the alert emails and the receipt model all state.
 * The helper exists so the wording can only be changed in one place.
 */
/** The period key a listing is priced in: `month` unless the record says otherwise. */
function property_rent_period_key(array $row): string
{
    $key = strtolower(trim((string)($row['rent_period'] ?? '')));
    return isset(PROPERTY_RENT_PERIOD_SUFFIX[$key]) ? $key : 'month';
}

/** The period suffix used in share text and on the poster (`/month`). */
function property_rent_period(array $row): string
{
    return PROPERTY_RENT_PERIOD_SUFFIX[property_rent_period_key($row)];
}

/**
 * The one-line share description: price, period and location.
 *
 *   "GH₵ 6,500/month · Cantonments, Accra"
 *
 * Deliberately short: it is what appears under the photograph in a WhatsApp,
 * Facebook, X or LinkedIn card. No marketing copy, no description text.
 */
function property_share_description(array $row): string
{
    $rent = property_money_label((float)($row['rent_ghs'] ?? $row['rentGhs'] ?? 0));
    $location = trim((string)($row['location'] ?? ''));
    $city = trim((string)($row['city'] ?? ''));

    // "Cantonments, Accra" — but never "Accra, Accra".
    $place = $location;
    if ($city !== '' && !str_contains(strtolower($location), strtolower($city))) {
        $place = $location === '' ? $city : $location . ', ' . $city;
    }
    if ($place === '') {
        $place = 'Ghana';
    }

    return $rent . property_rent_period($row) . ' · ' . $place;
}

/** Absolute URL of the site's default social image. */
function property_default_share_image(): string
{
    return SITE_URL . '/og-image.jpg';
}

/**
 * Absolute URL of the property's own main photograph, or the site default.
 *
 * The first usable entry of `images` is the main photograph — the same one the
 * listing page shows first. Relative upload paths (`/api/uploads/…`) are made
 * absolute against the configured site URL; anything that is not a plausible
 * http(s) URL is skipped rather than emitted as a broken preview. Private
 * storage paths are never produced by the upload endpoint, so nothing private
 * can be surfaced here.
 */
function property_main_image_url(array $row): string
{
    $images = $row['images'] ?? [];
    if (is_string($images)) {
        $images = json_column($images);
    }
    if (!is_array($images)) {
        return property_default_share_image();
    }

    foreach ($images as $candidate) {
        if (!is_string($candidate)) {
            continue;
        }
        $url = trim($candidate);
        if ($url === '') {
            continue;
        }
        if (preg_match('#^https?://#i', $url)) {
            // Absolute (e.g. a host that already stores full URLs).
            return $url;
        }
        if (str_starts_with($url, '//')) {
            continue;
        }
        // Never build an absolute URL out of a traversal attempt.
        if (str_contains($url, '..')) {
            continue;
        }
        // Nor out of anything that is not a path: `data:`, `blob:`,
        // `javascript:` and friends are not photographs of this listing.
        if (preg_match('#^[a-z][a-z0-9+.-]*:#i', $url)) {
            continue;
        }
        return SITE_URL . '/' . ltrim($url, '/');
    }

    return property_default_share_image();
}

/**
 * The property's share-card metadata as a map.
 *
 * @return array{title:string,description:string,image:string,url:string,siteName:string,type:string}
 */
function property_share_meta(array $row): array
{
    $title = trim((string)($row['title'] ?? ''));
    if ($title === '') {
        $title = 'Rental property';
    }

    return [
        'title'       => $title,
        'description' => property_share_description($row),
        'image'       => property_main_image_url($row),
        'url'         => property_canonical_url($row),
        'siteName'    => 'Goodlucks Homes',
        'type'        => 'website',
    ];
}

/**
 * The complete `<head>` metadata block for a property page.
 *
 * Written into the initial HTML response, so WhatsApp, Facebook, X, LinkedIn,
 * Slack and any crawler that does not run JavaScript sees the real listing.
 * The React app then takes over in the browser; `SEOHead` renders the same
 * values so the two never disagree.
 */
function property_share_meta_html(array $row): string
{
    $meta = property_share_meta($row);
    $title = $meta['title'] . ' · ' . property_share_description($row) . ' | Goodlucks Homes';

    $tags = [
        '<title>' . e($title) . '</title>',
        '<meta name="description" content="' . e($meta['description']) . '" />',
        '<link rel="canonical" href="' . e($meta['url']) . '" />',
        '<meta property="og:type" content="' . e($meta['type']) . '" />',
        '<meta property="og:site_name" content="' . e($meta['siteName']) . '" />',
        '<meta property="og:locale" content="en_GH" />',
        '<meta property="og:title" content="' . e($meta['title']) . '" />',
        '<meta property="og:description" content="' . e($meta['description']) . '" />',
        '<meta property="og:url" content="' . e($meta['url']) . '" />',
        '<meta property="og:image" content="' . e($meta['image']) . '" />',
        '<meta property="og:image:alt" content="' . e($meta['title']) . '" />',
        '<meta name="twitter:card" content="summary_large_image" />',
        '<meta name="twitter:title" content="' . e($meta['title']) . '" />',
        '<meta name="twitter:description" content="' . e($meta['description']) . '" />',
        '<meta name="twitter:image" content="' . e($meta['image']) . '" />',
    ];

    return implode("\n    ", $tags);
}

/** The `<head>` block used when a property id does not resolve. */
function property_missing_meta_html(): string
{
    $url = SITE_URL . '/properties';
    return implode("\n    ", [
        '<title>Property not available | Goodlucks Homes</title>',
        '<meta name="robots" content="noindex, follow" />',
        '<meta name="description" content="This listing is no longer available. Browse current rentals on Goodlucks Homes." />',
        '<meta property="og:type" content="website" />',
        '<meta property="og:site_name" content="Goodlucks Homes" />',
        '<meta property="og:title" content="Property not available | Goodlucks Homes" />',
        '<meta property="og:description" content="This listing is no longer available. Browse current rentals on Goodlucks Homes." />',
        '<meta property="og:url" content="' . e($url) . '" />',
        '<meta property="og:image" content="' . e(property_default_share_image()) . '" />',
        '<meta name="twitter:card" content="summary_large_image" />',
        '<meta name="twitter:title" content="Property not available | Goodlucks Homes" />',
        '<meta name="twitter:description" content="This listing is no longer available. Browse current rentals on Goodlucks Homes." />',
        '<meta name="twitter:image" content="' . e(property_default_share_image()) . '" />',
    ]);
}

/**
 * The application shell (`index.html`) with the property metadata injected.
 *
 * The shell is the built SPA document; PHP only rewrites its `<head>`. When the
 * built file is not present (local PHP-only runs, tests) a minimal but complete
 * document is used instead, so the metadata is always executable and testable
 * without the JavaScript bundle.
 */
function property_render_shell(string $metaHtml): string
{
    $shell = property_shell_html();
    return property_inject_meta($shell, $metaHtml);
}

/** Read the SPA shell from disk, or fall back to a minimal document. */
function property_shell_html(): string
{
    $candidates = [
        (string)cfg('PROPERTY_SHELL_PATH', ''),
        // production layout: public_html/index.html next to public_html/api/
        dirname(GL_ROOT) . '/index.html',
        GL_ROOT . '/index.html',
    ];

    foreach ($candidates as $candidate) {
        if ($candidate === '' || !is_file($candidate) || !is_readable($candidate)) {
            continue;
        }
        $html = @file_get_contents($candidate);
        if (is_string($html) && str_contains($html, '</head>')) {
            return $html;
        }
    }

    return "<!doctype html>\n<html lang=\"en-GH\">\n  <head>\n    <meta charset=\"UTF-8\" />\n"
        . "    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />\n    "
        . "<!--GL_PROPERTY_META-->\n  </head>\n  <body>\n    <div id=\"root\"></div>\n  </body>\n</html>\n";
}

/**
 * Replace the generic metadata in a shell with one set of property metadata.
 *
 * The shell ships site-wide `<title>`, description, canonical, Open Graph and
 * Twitter tags. All of them are removed first so the response never contains two
 * competing `og:title` (or two canonicals), which confuses crawlers and social
 * scrapers more than having none.
 */
function property_inject_meta(string $shell, string $metaHtml): string
{
    $cleaned = preg_replace([
        '#<title>.*?</title>#is',
        '#<meta\s+name="(?:description|keywords|twitter:[^"]*|robots)"[^>]*>\s*#i',
        '#<meta\s+property="(?:og:[^"]*)"[^>]*>\s*#i',
        '#<link\s+rel="canonical"[^>]*>\s*#i',
    ], '', $shell);

    if (!is_string($cleaned) || !str_contains($cleaned, '</head>')) {
        $cleaned = $shell;
    }

    if (str_contains($cleaned, '<!--GL_PROPERTY_META-->')) {
        return str_replace('<!--GL_PROPERTY_META-->', $metaHtml, $cleaned);
    }

    return str_replace('</head>', "    " . $metaHtml . "\n  </head>", $cleaned);
}
