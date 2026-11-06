<?php
/**
 * Goodlucks Homes - Blog content helpers
 *
 * Everything in this file is about the *text* of an article: turning a title
 * into a URL slug, turning the editor's HTML into markup that is safe to store
 * and safe to show, recognising a YouTube link, and finding the links in a piece
 * of HTML (the email template editor needs that to warn about a dead article
 * link).
 *
 * The sanitiser is a small, predictable tokeniser rather than a regex that tries
 * to delete dangerous fragments: it parses the input, throws away anything it
 * does not recognise, and rebuilds the output from its own allowlist. Nothing
 * from the input is ever copied into the output verbatim, so a tag or attribute
 * that is not explicitly allowed cannot survive.
 *
 * Only an administrator can reach these functions (see lib/blog_api.php), but
 * the output is stored and then rendered into public pages, so it is treated as
 * untrusted anyway.
 */

declare(strict_types=1);

/** Longest article body the API accepts (characters of HTML). */
const BLOG_CONTENT_MAX_CHARS = 200000;

/** Longest slug we will store or route to. */
const BLOG_SLUG_MAX = 120;

/** A YouTube video id: exactly the 11 characters YouTube uses. */
const BLOG_YOUTUBE_ID_PATTERN = '/^[A-Za-z0-9_-]{11}$/';

/** The canonical wrapper for a responsive video. */
const BLOG_VIDEO_HOST = 'https://www.youtube-nocookie.com';

/**
 * The place in an article body where the property showcase is rendered.
 *
 * The editor inserts this element; the public article splits the body around it
 * so editorial text can come both before and after the live property cards. It
 * is the only `<div>` with content the sanitiser preserves, and it carries no
 * attributes except this exact class.
 */
const BLOG_SHOWCASE_CLASS = 'gl-showcase';

/** Tags the sanitiser keeps, with the attributes each one may carry. */
function blog_allowed_tags(): array
{
    return [
        'p'          => [],
        'br'         => [],
        'hr'         => [],
        'h2'         => [],
        'h3'         => [],
        'h4'         => [],
        'strong'     => [],
        'b'          => [],
        'em'         => [],
        'i'          => [],
        'u'          => [],
        's'          => [],
        'code'       => [],
        'pre'        => [],
        'ul'         => [],
        'ol'         => [],
        'li'         => [],
        'blockquote' => [],
        'figure'     => ['class'],
        'figcaption' => [],
        'a'          => ['href', 'title'],
        'img'        => ['src', 'alt', 'width', 'height'],
        'aside'      => ['class'],
        'div'        => ['class'],
        'iframe'     => ['src', 'title'],
    ];
}

/** Tags that never have a closing partner. */
function blog_void_tags(): array
{
    return ['br', 'hr', 'img'];
}

/**
 * Turn a title into a URL slug.
 *
 * Deliberately conservative: lowercase ASCII letters, digits and single
 * hyphens. A Ghanaian place name with an accent falls back to its unaccented
 * form rather than to an empty slug, and the caller always has the option of
 * supplying its own slug.
 */
function blog_slugify(string $text): string
{
    $value = trim($text);
    if ($value === '') {
        return '';
    }
    if (function_exists('iconv')) {
        $converted = @iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $value);
        if (is_string($converted)) {
            $value = $converted;
        }
    }
    $value = mb_strtolower($value, 'UTF-8');
    $value = preg_replace('/[^a-z0-9]+/', '-', $value) ?? '';
    $value = trim($value, '-');
    $value = preg_replace('/-{2,}/', '-', $value) ?? '';

    return mb_substr($value, 0, BLOG_SLUG_MAX);
}

/** True when a string is a slug this application is willing to route to. */
function blog_valid_slug(string $slug): bool
{
    if ($slug === '' || mb_strlen($slug) > BLOG_SLUG_MAX) {
        return false;
    }

    return (bool)preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)*$/', $slug);
}

/**
 * Extract the video id from a supported YouTube URL.
 *
 * Supported: youtu.be/<id>, youtube.com/watch?v=<id>, youtube.com/embed/<id>,
 * youtube.com/shorts/<id>, youtube.com/live/<id>, with or without `www.`,
 * `m.`, `music.`, and with extra query parameters. Anything else — including a
 * URL for a different site — returns null.
 */
function blog_youtube_id(string $url): ?string
{
    $url = trim($url);
    if ($url === '') {
        return null;
    }
    // A bare id is accepted so the editor can paste just the id.
    if (preg_match(BLOG_YOUTUBE_ID_PATTERN, $url)) {
        return $url;
    }

    $parts = @parse_url($url);
    if (!is_array($parts) || !isset($parts['host'])) {
        return null;
    }
    $scheme = strtolower((string)($parts['scheme'] ?? 'https'));
    if ($scheme !== 'https' && $scheme !== 'http') {
        return null;
    }

    $host = strtolower((string)$parts['host']);
    $host = preg_replace('/^(www\.|m\.|music\.)/', '', $host) ?? $host;

    $path = (string)($parts['path'] ?? '');
    $query = [];
    if (isset($parts['query'])) {
        parse_str((string)$parts['query'], $query);
    }

    $candidate = '';
    if ($host === 'youtu.be') {
        $candidate = trim($path, '/');
        // A youtu.be link may carry the id with a trailing segment.
        $candidate = explode('/', $candidate)[0] ?? '';
    } elseif ($host === 'youtube.com' || $host === 'youtube-nocookie.com') {
        if (preg_match('#^/(?:embed|shorts|live|v)/([^/?#]+)#', $path, $m)) {
            $candidate = $m[1];
        } elseif (isset($query['v']) && is_string($query['v'])) {
            $candidate = $query['v'];
        }
    } else {
        return null;
    }

    $candidate = trim($candidate);

    return preg_match(BLOG_YOUTUBE_ID_PATTERN, $candidate) ? $candidate : null;
}

/**
 * The canonical, responsive embed markup for a video id.
 *
 * Uses the no-cookie host, which sets no tracking cookies until the visitor
 * plays the video, and keeps the iframe unprivileged.
 */
function blog_youtube_embed(string $videoId, string $title = ''): string
{
    if (!preg_match(BLOG_YOUTUBE_ID_PATTERN, $videoId)) {
        return '';
    }
    $label = $title !== '' ? $title : 'YouTube video';

    return '<iframe class="gl-video-frame" src="' . BLOG_VIDEO_HOST . '/embed/' . $videoId . '"'
        . ' title="' . e($label) . '" loading="lazy" frameborder="0"'
        . ' allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"'
        . ' referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>';
}

/** True when a URL is a safe destination for an `<a href>`. */
function blog_safe_link_href(string $href): ?string
{
    $href = trim($href);
    if ($href === '' || mb_strlen($href) > 2000) {
        return null;
    }
    // Control characters and whitespace tricks in a URL are never legitimate.
    if (preg_match('/[\x00-\x1F\x7F\s]/', $href)) {
        return null;
    }
    $lower = strtolower($href);
    foreach (['javascript:', 'data:', 'vbscript:', 'file:'] as $banned) {
        if (str_starts_with($lower, $banned)) {
            return null;
        }
    }
    if (str_starts_with($href, '/')) {
        // Internal link: a single leading slash, no protocol-relative form.
        return str_starts_with($href, '//') ? null : $href;
    }
    if (preg_match('#^https?://#i', $href)) {
        return $href;
    }
    if (preg_match('#^mailto:[^@\s]+@[^@\s]+\.[^@\s]+$#i', $href)) {
        return $href;
    }
    if (preg_match('#^tel:\+?[0-9 ]{6,20}$#', $href)) {
        return $href;
    }

    return null;
}

/** True when an image source is one this site is willing to display. */
function blog_safe_image_src(string $src): ?string
{
    $src = trim($src);
    if ($src === '' || mb_strlen($src) > 1000) {
        return null;
    }
    if (preg_match('/[\x00-\x1F\x7F\s]/', $src)) {
        return null;
    }
    if (str_starts_with($src, '/api/uploads/') || str_starts_with($src, '/uploads/')) {
        $name = basename($src);

        return preg_match('/^[A-Za-z0-9._-]+$/', $name) ? $src : null;
    }
    if (preg_match('#^https://#i', $src)) {
        return $src;
    }

    return null;
}

/** True when a class value is one the article styles know about. */
function blog_allowed_class(string $tag, string $value): ?string
{
    $value = trim($value);
    if ($tag === 'div' && $value === BLOG_SHOWCASE_CLASS) {
        return $value;
    }
    if ($tag === 'figure' && ($value === 'gl-callout' || $value === 'gl-video')) {
        return $value;
    }
    if ($tag === 'aside' && ($value === 'gl-callout' || $value === 'gl-callout-information' || $value === 'gl-callout-warning')) {
        return $value;
    }

    return null;
}

/**
 * Sanitise administrator-authored HTML down to the article allowlist.
 *
 * @param array{allow_media?: bool} $options
 *   `allow_media` (default true) keeps images, figures and YouTube embeds. The
 *   email template editor passes false: those bodies are plain text with links.
 */
function blog_sanitize_html(string $html, array $options = []): string
{
    $allowMedia = $options['allow_media'] ?? true;
    $allowed = blog_allowed_tags();
    $void = blog_void_tags();

    // Nothing binary, no comments, no server-side includes.
    $html = str_replace(["\0", "\r\n"], ['', "\n"], $html);
    $html = preg_replace('/<!--.*?-->/s', '', $html) ?? '';
    $html = preg_replace('/<\?(?:php|=).*?\?>/s', '', $html) ?? '';
    // Elements whose CONTENT is never article text: drop them whole, so a
    // removed <script> does not leave its body behind as visible text.
    $html = preg_replace(
        '#<(script|style|object|embed|template|noscript|svg|math)\b[^>]*>.*?</\1\s*>#is',
        '',
        $html
    ) ?? $html;
    $html = preg_replace('#<(script|style|object|embed|template|noscript|svg|math)\b[^>]*/?>#is', '', $html) ?? $html;

    $output = '';
    $stack = [];
    $offset = 0;
    $length = strlen($html);

    while ($offset < $length && preg_match('/<[^>]*>/', $html, $match, PREG_OFFSET_CAPTURE, $offset)) {
        $tagText = $match[0][0];
        $tagStart = (int)$match[0][1];

        if ($tagStart > $offset) {
            $output .= blog_escape_text(substr($html, $offset, $tagStart - $offset));
        }
        $offset = $tagStart + strlen($tagText);

        if (!preg_match('#^<\s*(/?)\s*([a-zA-Z][a-zA-Z0-9]*)([^>]*)>$#', $tagText, $parts)) {
            // Declarations (<!doctype>), processing instructions and malformed
            // fragments are dropped rather than guessed at.
            continue;
        }

        $isClosing = $parts[1] === '/';
        $tag = strtolower($parts[2]);
        $attributesRaw = $parts[3];

        if (!isset($allowed[$tag])) {
            continue; // Drop the tag; its text content is still escaped below.
        }
        if (!$allowMedia && in_array($tag, ['img', 'iframe', 'figure'], true)) {
            continue;
        }

        if ($isClosing) {
            if (!in_array($tag, $void, true)) {
                $output .= blog_close_tag($tag, $stack);
            }
            continue;
        }

        // Self-closing syntax on a tag that is not void is treated as an opener
        // that will simply be closed at the end of the document.
        $attributes = blog_parse_attributes($attributesRaw);

        if ($tag === 'iframe') {
            if (!$allowMedia) {
                continue;
            }
            $videoId = blog_youtube_id((string)($attributes['src'] ?? ''));
            if ($videoId === null) {
                continue;
            }
            $output .= blog_youtube_embed($videoId, (string)($attributes['title'] ?? ''));
            continue;
        }

        if ($tag === 'img') {
            $src = blog_safe_image_src((string)($attributes['src'] ?? ''));
            if ($src === null) {
                continue;
            }
            $alt = mb_substr(trim((string)($attributes['alt'] ?? '')), 0, 300);
            $output .= '<img src="' . e($src) . '" alt="' . e($alt) . '" loading="lazy" decoding="async"';
            $width = (int)($attributes['width'] ?? 0);
            $height = (int)($attributes['height'] ?? 0);
            if ($width > 0 && $width <= 4000) {
                $output .= ' width="' . $width . '"';
            }
            if ($height > 0 && $height <= 4000) {
                $output .= ' height="' . $height . '"';
            }
            $output .= '>';
            continue;
        }

        if ($tag === 'a') {
            $href = blog_safe_link_href((string)($attributes['href'] ?? ''));
            if ($href === null) {
                continue;
            }
            $title = mb_substr(trim((string)($attributes['title'] ?? '')), 0, 200);
            $external = (bool)preg_match('#^https?://#i', $href);
            $output .= '<a href="' . e($href) . '"';
            if ($title !== '') {
                $output .= ' title="' . e($title) . '"';
            }
            if ($external) {
                $output .= ' target="_blank" rel="noopener noreferrer"';
            }
            $output .= '>';
            $stack[] = 'a';
            continue;
        }

        if ($tag === 'div' || $tag === 'aside' || $tag === 'figure') {
            $class = blog_allowed_class($tag, (string)($attributes['class'] ?? ''));
            if ($class === null) {
                continue;
            }
            $output .= '<' . $tag . ' class="' . e($class) . '">';
            $stack[] = $tag;
            continue;
        }

        if (in_array($tag, $void, true)) {
            $output .= '<' . $tag . '>';
            continue;
        }

        $output .= '<' . $tag . '>';
        $stack[] = $tag;
    }

    if ($offset < $length) {
        $output .= blog_escape_text(substr($html, $offset));
    }

    // Close anything the author left open, innermost first.
    while ($stack !== []) {
        $output .= '</' . array_pop($stack) . '>';
    }

    return trim($output);
}

/** Escape a text node for output (existing entities are kept). */
function blog_escape_text(string $text): string
{
    if ($text === '') {
        return '';
    }

    return htmlspecialchars($text, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8', false);
}

/**
 * Emit the closing tag for `$tag`, closing any tags the author nested inside it
 * by mistake. Unmatched closing tags are dropped.
 */
function blog_close_tag(string $tag, array &$stack): string
{
    $position = array_search($tag, $stack, true);
    if ($position === false) {
        return '';
    }
    $out = '';
    while ($stack !== []) {
        $open = array_pop($stack);
        $out .= '</' . $open . '>';
        if ($open === $tag) {
            break;
        }
    }

    return $out;
}

/**
 * Parse `name="value"` attributes. Quoted values only, lowercase names, and only
 * the first occurrence of a name is kept.
 */
function blog_parse_attributes(string $raw): array
{
    $attributes = [];
    if (trim($raw) === '') {
        return $attributes;
    }
    if (preg_match_all('/([a-zA-Z-]+)\s*=\s*(?:"([^"]*)"|\'([^\']*)\')/', $raw, $matches, PREG_SET_ORDER)) {
        foreach ($matches as $match) {
            $name = strtolower($match[1]);
            $value = $match[2] !== '' ? $match[2] : ($match[3] ?? '');
            if (!array_key_exists($name, $attributes)) {
                $attributes[$name] = $value;
            }
        }
    }

    return $attributes;
}

/**
 * Split an article body around the property showcase placeholder.
 *
 * @return array{before: string, after: string, has_placeholder: bool}
 */
function blog_split_showcase(string $html): array
{
    $pattern = '/<div\s+class="' . preg_quote(BLOG_SHOWCASE_CLASS, '/') . '"\s*>\s*<\/div>/i';
    if (preg_match($pattern, $html, $match, PREG_OFFSET_CAPTURE)) {
        $start = (int)$match[0][1];
        $length = strlen($match[0][0]);

        return [
            'before'          => substr($html, 0, $start),
            'after'           => substr($html, $start + $length),
            'has_placeholder' => true,
        ];
    }

    return ['before' => $html, 'after' => '', 'has_placeholder' => false];
}

/** The placeholder markup the editor inserts (kept in one place). */
function blog_showcase_placeholder(): string
{
    return '<div class="' . BLOG_SHOWCASE_CLASS . '"></div>';
}

/**
 * Every link in a piece of HTML, in order, de-duplicated.
 *
 * The email template editor uses this to check that an inserted article link
 * still points at something published.
 *
 * @return string[]
 */
function blog_html_links(string $html): array
{
    $links = [];
    if (preg_match_all('/<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|\'([^\']*)\')/i', $html, $matches, PREG_SET_ORDER)) {
        foreach ($matches as $match) {
            $href = $match[1] !== '' ? $match[1] : ($match[2] ?? '');
            if ($href !== '' && !in_array($href, $links, true)) {
                $links[] = $href;
            }
        }
    }

    return $links;
}

/**
 * Turn an absolute or relative blog URL into a slug, or null when the link does
 * not point at an article at all.
 */
function blog_slug_from_url(string $url): ?string
{
    $path = $url;
    if (preg_match('#^https?://#i', $url)) {
        $parts = @parse_url($url);
        if (!is_array($parts) || !isset($parts['host'])) {
            return null;
        }
        $host = strtolower((string)$parts['host']);
        $site = strtolower((string)parse_url(SITE_URL, PHP_URL_HOST));
        if ($site !== '' && $host !== $site && $host !== 'www.' . $site) {
            return null;
        }
        $path = (string)($parts['path'] ?? '');
    }
    $path = (string)parse_url($path, PHP_URL_PATH);
    $path = '/' . ltrim($path, '/');
    if (!preg_match('#^/blog/([^/]+)/?$#', $path, $match)) {
        return null;
    }
    $slug = $match[1];

    return blog_valid_slug($slug) ? $slug : null;
}

/**
 * The plain text of a piece of HTML, for a meta description or a card summary.
 *
 * Falls back to nothing rather than inventing copy: a caller that gets an empty
 * string shows no description instead of a generated one.
 */
function blog_plain_text(string $html, int $limit = 300): string
{
    $text = preg_replace('/<(script|style)\b[^>]*>.*?<\/\1>/is', ' ', $html) ?? '';
    $text = str_replace([blog_showcase_placeholder(), '<br>', '<br/>', '</p>', '</li>'], ' ', $text);
    $text = strip_tags($text);
    $text = html_entity_decode($text, ENT_QUOTES | ENT_HTML5, 'UTF-8');
    $text = preg_replace('/\s+/u', ' ', $text) ?? '';
    $text = trim($text);
    if (mb_strlen($text) <= $limit) {
        return $text;
    }

    $cut = mb_substr($text, 0, max(0, $limit - 1));
    $lastSpace = mb_strrpos($cut, ' ');
    if ($lastSpace !== false && $lastSpace > $limit * 0.6) {
        $cut = mb_substr($cut, 0, $lastSpace);
    }

    return rtrim($cut, " ,.;:-") . '…';
}

/**
 * A short summary for a post card: the subtitle when the author wrote one,
 * otherwise the opening of the article, otherwise nothing.
 */
function blog_summary(array $post, int $limit = 200): string
{
    $subtitle = trim((string)($post['subtitle'] ?? ''));
    if ($subtitle !== '') {
        return $subtitle;
    }

    return blog_plain_text((string)($post['content_html'] ?? ''), $limit);
}

/**
 * Reading time in whole minutes, from the article's word count.
 *
 * Shown to readers as an estimate ("about 4 min read"); it is never used as a
 * ranking or quality signal.
 */
function blog_reading_minutes(string $html): int
{
    $words = str_word_count(blog_plain_text($html, 20000));
    if ($words <= 0) {
        return 1;
    }

    return max(1, (int)ceil($words / 200));
}

/**
 * Validate the video links inside a set of HTML fragments without changing them.
 *
 * Used by the email template editor to report what will be inserted.
 *
 * @return array<int, array{url: string, videoId: ?string}>
 */
function blog_list_video_links(string $html): array
{
    $links = [];
    if (preg_match_all('/<iframe\b[^>]*\bsrc\s*=\s*(?:"([^"]*)"|\'([^\']*)\')/i', $html, $matches, PREG_SET_ORDER)) {
        foreach ($matches as $match) {
            $src = $match[1] !== '' ? $match[1] : ($match[2] ?? '');
            $links[] = ['url' => $src, 'videoId' => blog_youtube_id($src)];
        }
    }

    return $links;
}
