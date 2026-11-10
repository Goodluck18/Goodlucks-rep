<?php
declare(strict_types=1);

/**
 * Goodlucks Homes — listing media and structured amenities (Upgrade 2, Phase 6)
 *
 * Three things live here, because they are all "the listing says something the
 * platform has to be able to trust":
 *
 *   C4 — a property video. Only YouTube, TikTok and Facebook are accepted, and
 *        only as a *canonical embed URL* built from a parsed id. Nothing is
 *        rendered from raw user HTML, and a link we cannot resolve without
 *        calling out to the network (a vm.tiktok.com or fb.watch short link) is
 *        refused with an explanation rather than guessed at.
 *
 *   C5 — amenities. They used to be free text, which made filtering impossible
 *        and produced a different vocabulary on every listing. They are now a
 *        closed set of canonical keys, with the original words kept alongside so
 *        a 2024 listing still renders exactly what its owner wrote.
 *
 *   C6 — the provider's own commission expectation. This is NOT a platform fee
 *        and is never used in a calculation; it exists so a provider can say
 *        "I expect 10% from the owner" without it being mistaken for what
 *        Goodlucks charges.
 */

/** Canonical amenity keys and the label shown to a human. */
const AMENITY_KEYS = [
    'air_conditioning'  => 'Air conditioning',
    'backup_power'      => 'Backup power / generator',
    'balcony'           => 'Balcony',
    'borehole_water'    => 'Borehole water',
    'cctv'              => 'CCTV',
    'dishwasher'        => 'Dishwasher',
    'elevator'          => 'Elevator',
    'fenced_compound'   => 'Fenced compound',
    'fitted_kitchen'    => 'Fitted kitchen',
    'furnished'         => 'Furnished',
    'gated_community'   => 'Gated community',
    'gym'               => 'Gym',
    'internet_ready'    => 'Internet ready',
    'parking'           => 'Parking',
    'pet_friendly'      => 'Pet friendly',
    'pool'              => 'Swimming pool',
    'security_guard'    => 'Security guard',
    'solar'             => 'Solar power',
    'staff_quarters'    => 'Staff quarters',
    'water_tank'        => 'Water storage tank',
];

/**
 * Words a listing might use for each canonical key. Matching is deliberately
 * generous — the point is to rescue existing free text, not to be clever.
 */
const AMENITY_SYNONYMS = [
    'air_conditioning' => ['air condition', 'air conditioning', 'ac', 'a c', 'split unit', 'aircon'],
    'backup_power'     => ['backup power', 'back up power', 'generator', 'gen set', 'genset', 'inverter', 'standby power'],
    'balcony'          => ['balcony', 'terrace', 'verandah', 'veranda'],
    'borehole_water'   => ['borehole', 'bore hole', 'well water'],
    'cctv'             => ['cctv', 'camera', 'cameras', 'surveillance'],
    'dishwasher'       => ['dishwasher', 'dish washer'],
    'elevator'         => ['elevator', 'lift'],
    'fenced_compound'  => ['fenced', 'fence', 'walled', 'wall', 'compound wall'],
    'fitted_kitchen'   => ['fitted kitchen', 'kitchen cabinet', 'kitchen cabinets', 'modern kitchen'],
    'furnished'        => ['furnished', 'fully furnished'],
    'gated_community'  => ['gated', 'gated community', 'estate'],
    'gym'              => ['gym', 'fitness'],
    'internet_ready'   => ['internet', 'wifi', 'wi fi', 'fibre', 'fiber', 'broadband'],
    'parking'          => ['parking', 'car park', 'garage', 'carport'],
    'pet_friendly'     => ['pet', 'pets', 'pet friendly'],
    'pool'             => ['pool', 'swimming pool', 'swimming'],
    'security_guard'   => ['security', 'security guard', 'guard', 'guarded'],
    'solar'            => ['solar', 'solar panel', 'solar panels', 'solar power'],
    'staff_quarters'   => ['staff quarters', 'boys quarters', 'out house', 'outhouse', 'bq'],
    'water_tank'       => ['water tank', 'water storage', 'polytank', 'poly tank', 'water reservoir'],
];

/** How a property is furnished. A closed set, and empty means "not stated". */
const FURNISHING_STATES = [
    'unfurnished'    => 'Unfurnished',
    'semi_furnished' => 'Semi-furnished',
    'furnished'      => 'Furnished',
];

/** Lower-case a phrase and reduce punctuation to single spaces. */
function amenity_normalise_phrase(string $value): string
{
    $value = strtolower(trim($value));
    $value = preg_replace('/[^a-z0-9]+/', ' ', $value) ?? $value;

    return trim(preg_replace('/\s+/', ' ', $value) ?? $value);
}

/** The canonical key for one free-text amenity, or null when it is unknown. */
function amenity_key_for(string $value): ?string
{
    $phrase = amenity_normalise_phrase($value);
    if ($phrase === '') {
        return null;
    }
    if (isset(AMENITY_KEYS[$phrase])) {
        return $phrase;
    }

    // Exact synonym first, then a word-boundary containment check so
    // "Parking space for two cars" still maps to parking.
    foreach (AMENITY_SYNONYMS as $key => $words) {
        foreach ($words as $word) {
            if ($phrase === $word) {
                return $key;
            }
        }
    }
    foreach (AMENITY_SYNONYMS as $key => $words) {
        foreach ($words as $word) {
            $pattern = '/(^| )' . preg_quote($word, '/') . '( |$)/';
            if (preg_match($pattern, $phrase)) {
                return $key;
            }
        }
    }

    return null;
}

/**
 * Turn whatever a listing sent (or has stored) into canonical keys plus the
 * words we could not map.
 *
 * @param array<int, mixed>|string|null $values
 * @return array{keys: array<int, string>, unknown: array<int, string>}
 */
function normalise_amenities(array|string|null $values): array
{
    if (is_string($values)) {
        $values = preg_split('/[,;\n]+/', $values) ?: [];
    }
    $keys = [];
    $unknown = [];
    foreach ((array)$values as $value) {
        if (!is_string($value)) {
            continue;
        }
        $clean = clean_string($value, 80);
        if ($clean === '') {
            continue;
        }
        $key = amenity_key_for($clean);
        if ($key === null) {
            $unknown[] = $clean;
        } elseif (!in_array($key, $keys, true)) {
            $keys[] = $key;
        }
    }

    return ['keys' => $keys, 'unknown' => $unknown];
}

/** Human labels for a set of canonical keys, in the order the keys were given. */
function amenity_labels(array $keys): array
{
    $labels = [];
    foreach ($keys as $key) {
        if (isset(AMENITY_KEYS[$key])) {
            $labels[] = AMENITY_KEYS[$key];
        }
    }

    return $labels;
}

// ---------------------------------------------------------------------------
// C4 — video embeds
// ---------------------------------------------------------------------------

/** Providers we accept, and the only ones we will ever render. */
const PROPERTY_VIDEO_PROVIDERS = ['youtube', 'tiktok', 'facebook'];

/**
 * Parse a video link into a provider, a canonical URL and an embed URL.
 *
 * Short links that need a network round-trip to resolve (vm.tiktok.com,
 * tiktok.com/t/…, fb.watch) are refused with an explanation: guessing the
 * target would mean rendering a video the provider never approved.
 *
 * @return array{provider: ?string, url: ?string, embedUrl: ?string, error: ?string}
 */
function parse_property_video(?string $raw): array
{
    $empty = ['provider' => null, 'url' => null, 'embedUrl' => null, 'error' => null];
    $value = trim((string)$raw);
    if ($value === '') {
        return $empty;
    }

    $host = strtolower((string)parse_url($value, PHP_URL_HOST));
    $host = preg_replace('/^www\./', '', $host) ?? $host;
    $path = (string)(parse_url($value, PHP_URL_PATH) ?? '');
    $query = [];
    parse_str((string)(parse_url($value, PHP_URL_QUERY) ?? ''), $query);

    $refuse = static function (string $message) use ($empty): array {
        return array_merge($empty, ['error' => $message]);
    };

    // --- YouTube -----------------------------------------------------------
    if (in_array($host, ['youtube.com', 'm.youtube.com', 'youtube-nocookie.com', 'youtu.be'], true)) {
        $id = '';
        if ($host === 'youtu.be') {
            $id = trim($path, '/');
        } elseif (preg_match('#^/shorts/([A-Za-z0-9_-]{11})#', $path, $m)
            || preg_match('#^/embed/([A-Za-z0-9_-]{11})#', $path, $m)
            || preg_match('#^/live/([A-Za-z0-9_-]{11})#', $path, $m)
        ) {
            $id = $m[1];
        } elseif (isset($query['v'])) {
            $id = (string)$query['v'];
        }
        if (!preg_match('/^[A-Za-z0-9_-]{11}$/', $id)) {
            return $refuse('That YouTube link does not contain a video id. Use the normal watch, share or Shorts link.');
        }

        return [
            'provider' => 'youtube',
            'url'      => 'https://www.youtube.com/watch?v=' . $id,
            'embedUrl' => 'https://www.youtube-nocookie.com/embed/' . $id,
            'error'    => null,
        ];
    }

    // --- TikTok ------------------------------------------------------------
    if ($host === 'tiktok.com' || $host === 'm.tiktok.com') {
        if (preg_match('#^/@[^/]+/video/(\d{6,})#', $path, $m)) {
            return [
                'provider' => 'tiktok',
                'url'      => 'https://www.tiktok.com/@user/video/' . $m[1],
                'embedUrl' => 'https://www.tiktok.com/player/v1/' . $m[1],
                'error'    => null,
            ];
        }

        return $refuse(
            'Use the full TikTok link that contains /video/<id> (open the video, then Copy link). '
            . 'Short vm.tiktok.com links cannot be checked without opening them, so they are not accepted.'
        );
    }
    if ($host === 'vm.tiktok.com') {
        return $refuse(
            'Short TikTok links cannot be verified. Open the video and copy the full tiktok.com/@…/video/… link.'
        );
    }

    // --- Facebook ----------------------------------------------------------
    if (in_array($host, ['facebook.com', 'm.facebook.com', 'web.facebook.com', 'fb.watch'], true)) {
        if ($host === 'fb.watch') {
            return $refuse(
                'Short Facebook links (fb.watch) cannot be verified. Use the full facebook.com video link.'
            );
        }
        $isVideo = preg_match('#/videos/#', $path)
            || (isset($query['v']) && $query['v'] !== '');
        if (!$isVideo) {
            return $refuse('That Facebook link is not a video. Use the address from the video itself.');
        }

        return [
            'provider' => 'facebook',
            'url'      => $value,
            'embedUrl' => 'https://www.facebook.com/plugins/video.php?href=' . rawurlencode($value)
                . '&show_text=false&width=560',
            'error'    => null,
        ];
    }

    return $refuse('Only YouTube, TikTok and Facebook videos are accepted.');
}
