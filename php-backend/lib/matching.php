<?php
declare(strict_types=1);

/**
 * Goodlucks Homes — tenant matching (Upgrade 2, Phase 5: B2/B3)
 *
 * A match score has to mean something. Before Phase 5 it was an unexplained
 * number (base 70 + a few bonuses, clamped 40–98) that ignored bathrooms and
 * treated "location" as a substring test, so two very different homes could show
 * the same percentage.
 *
 * This file makes the score a documented weighted sum of six things the tenant
 * actually asked for:
 *
 *   budget     35   the rent is inside the stated range
 *   location   20   the listing is in one of the preferred areas
 *   proximity  15   the listing is in, or next to, a preferred area
 *   type       10   the property type matches
 *   bedrooms   10   the listing has at least the requested bedrooms
 *   bathrooms  10   the listing has at least the requested bathrooms
 *
 * Proximity is the one that could not be honestly guessed: the platform has no
 * coordinates for its listings (the schema allows them, but nobody has geocoded
 * anything). Rather than invent a distance, proximity is read from an
 * administrator-maintained adjacency table: "East Legon is next to Cantonments".
 * When no adjacency is recorded, proximity scores zero and the breakdown says
 * so — the number never pretends to know something the platform does not.
 *
 * Every score is returned with its breakdown, so a tenant can see why a listing
 * was suggested and staff can defend the ordering.
 */

/** The weights, in points. They sum to 100 and are the only place they are set. */
const MATCH_WEIGHTS = [
    'budget'    => 35,
    'location'  => 20,
    'proximity' => 15,
    'type'      => 10,
    'bedrooms'  => 10,
    'bathrooms' => 10,
];

/**
 * How close two areas are, in the administrator's judgement.
 *
 *   1 = next to it (walking distance)
 *   2 = near it (a short drive)
 */
const AREA_ADJACENCY_BANDS = [
    1 => 'Next to',
    2 => 'Near',
];

/** Human labels used in the breakdown the UI shows. */
const MATCH_FACTOR_LABELS = [
    'budget'    => 'Budget',
    'location'  => 'Preferred area',
    'proximity' => 'Near a preferred area',
    'type'      => 'Property type',
    'bedrooms'  => 'Bedrooms',
    'bathrooms' => 'Bathrooms',
];

/** Normalise an area name so "East Legon," and "east  legon" are the same place. */
function match_area_key(string $area): string
{
    $area = strtolower(trim($area));
    $area = str_replace([',', '.', '/', '–', '—'], ' ', $area);
    $area = preg_replace('/\s+/', ' ', $area) ?? $area;
    // "East Legon, Accra" and "East Legon" are the same area for adjacency.
    $area = preg_replace('/\s+accra$/', '', $area) ?? $area;
    return trim($area);
}

/**
 * The stored key for an undirected pair: lower-cased, sorted, so A→B and B→A
 * can never both exist with different bands.
 *
 * @return array{0:string,1:string}
 */
function area_adjacency_pair(string $a, string $b): array
{
    $left = match_area_key($a);
    $right = match_area_key($b);
    return $left <= $right ? [$left, $right] : [$right, $left];
}

/** The recorded band between two areas, or null when the administrator has not said. */
function area_adjacency_band(string $a, string $b): ?int
{
    [$left, $right] = area_adjacency_pair($a, $b);
    if ($left === '' || $right === '' || $left === $right) {
        return null;
    }

    $band = db_value(
        'SELECT band FROM area_adjacency WHERE area_a = :a AND area_b = :b',
        [':a' => $left, ':b' => $right]
    );

    return $band === null ? null : (int)$band;
}

/** Every recorded adjacency, newest first, with display labels. */
function list_area_adjacency(): array
{
    $rows = db_all('SELECT * FROM area_adjacency ORDER BY area_a ASC, area_b ASC');

    return array_map(static function (array $row): array {
        $band = (int)($row['band'] ?? 2);
        return [
            'id'        => (string)$row['id'],
            'areaA'     => (string)$row['area_a'],
            'areaB'     => (string)$row['area_b'],
            'band'      => $band,
            'bandLabel' => AREA_ADJACENCY_BANDS[$band] ?? 'Near',
            'note'      => (string)($row['note'] ?? ''),
            'createdBy' => (string)($row['created_by'] ?? ''),
            'createdAt' => to_iso($row['created_at'] ?? null),
        ];
    }, $rows);
}

/**
 * Record (or replace) the adjacency between two areas.
 *
 * Replacing an existing pair updates the band in place: there is one row per
 * pair, never two that disagree.
 *
 * @throws InvalidArgumentException when the input is not a usable pair
 */
function save_area_adjacency(array $input, array $actor): array
{
    $areaA = clean_string($input['areaA'] ?? $input['area_a'] ?? '', 120);
    $areaB = clean_string($input['areaB'] ?? $input['area_b'] ?? '', 120);
    $band = (int)($input['band'] ?? 2);
    $note = clean_string($input['note'] ?? '', 300);

    if (match_area_key($areaA) === '' || match_area_key($areaB) === '') {
        throw new InvalidArgumentException('Name both areas.');
    }
    if (match_area_key($areaA) === match_area_key($areaB)) {
        throw new InvalidArgumentException('An area is not adjacent to itself. Choose two different areas.');
    }
    if (!isset(AREA_ADJACENCY_BANDS[$band])) {
        throw new InvalidArgumentException('Choose how close the areas are: 1 (next to) or 2 (near).');
    }

    [$left, $right] = area_adjacency_pair($areaA, $areaB);
    $existing = db_one(
        'SELECT * FROM area_adjacency WHERE area_a = :a AND area_b = :b',
        [':a' => $left, ':b' => $right]
    );

    if ($existing) {
        db_exec(
            'UPDATE area_adjacency SET band = :band, note = :note, updated_at = :updated WHERE id = :id',
            [':band' => $band, ':note' => $note !== '' ? $note : null, ':updated' => db_now(), ':id' => (string)$existing['id']]
        );
        $id = (string)$existing['id'];
        $action = 'area_adjacency.updated';
    } else {
        $id = new_id('adj');
        db_exec(
            'INSERT INTO area_adjacency (id, area_a, area_b, band, note, created_by, created_at)
             VALUES (:id, :a, :b, :band, :note, :by, :created)',
            [
                ':id'      => $id,
                ':a'       => $left,
                ':b'       => $right,
                ':band'    => $band,
                ':note'    => $note !== '' ? $note : null,
                ':by'      => (string)($actor['id'] ?? ''),
                ':created' => db_now(),
            ]
        );
        $action = 'area_adjacency.created';
    }

    audit_log($action, 'area_adjacency', $id, [
        'areaA' => $left,
        'areaB' => $right,
        'band'  => $band,
    ], $actor);

    return shape_area_adjacency($id);
}

function shape_area_adjacency(string $id): array
{
    foreach (list_area_adjacency() as $row) {
        if ($row['id'] === $id) {
            return $row;
        }
    }

    throw new InvalidArgumentException('Area adjacency not found.');
}

/** Remove an adjacency. It only ever changes future scores; nothing historical. */
function delete_area_adjacency(string $id, array $actor): void
{
    $row = db_one('SELECT * FROM area_adjacency WHERE id = :id', [':id' => $id]);
    if (!$row) {
        throw new InvalidArgumentException('Area adjacency not found.');
    }

    db_exec('DELETE FROM area_adjacency WHERE id = :id', [':id' => $id]);
    audit_log('area_adjacency.deleted', 'area_adjacency', $id, [
        'areaA' => (string)$row['area_a'],
        'areaB' => (string)$row['area_b'],
        'band'  => (int)($row['band'] ?? 2),
    ], $actor);
}

/** The areas the platform actually has listings in, so staff pick real names. */
function match_known_areas(): array
{
    $rows = db_all('SELECT DISTINCT location FROM properties WHERE location IS NOT NULL AND location <> \'\'');
    $areas = [];
    foreach ($rows as $row) {
        $location = (string)$row['location'];
        // "East Legon, Accra" → "East Legon": the city is not an area.
        $primary = trim(explode(',', $location)[0]);
        $key = match_area_key($primary);
        if ($key !== '' && !isset($areas[$key])) {
            $areas[$key] = $primary;
        }
    }
    ksort($areas);

    return array_values($areas);
}

/**
 * Score one listing against one request, with the reasoning.
 *
 * @return array{score:int, reason:string, breakdown:array<int, array{factor:string,label:string,points:int,max:int,detail:string}>}
 */
function match_score_breakdown(array $request, array $property): array
{
    $rent = (float)($property['rentGhs'] ?? 0);
    $budgetMin = (float)($request['budgetMin'] ?? 0);
    $budgetMax = (float)($request['budgetMax'] ?? 0);
    $bedrooms = (int)($property['bedrooms'] ?? 0);
    $bathrooms = (int)($property['bathrooms'] ?? 0);
    $wantedBedrooms = (int)($request['bedrooms'] ?? 0);
    $wantedBathrooms = (int)($request['bathrooms'] ?? 0);
    $propertyArea = (string)($property['location'] ?? '');
    $preferred = array_values(array_filter(
        array_map(static fn($v) => is_string($v) ? trim($v) : '', (array)($request['preferredLocations'] ?? [])),
        static fn($v) => $v !== ''
    ));

    $breakdown = [];

    // --- Budget (35) -------------------------------------------------------
    $budgetPoints = 0;
    $budgetDetail = '';
    if ($budgetMax <= 0) {
        $budgetDetail = 'The request did not set a budget range.';
    } elseif ($rent <= 0) {
        $budgetDetail = 'This listing has no rent recorded.';
    } elseif ($rent < $budgetMin) {
        // Cheaper than the tenant asked for: affordable, but possibly not what
        // they had in mind, so it earns most of the points, not all.
        $budgetPoints = (int)round(MATCH_WEIGHTS['budget'] * 0.75);
        $budgetDetail = sprintf(
            'GH₵ %s/month, below the GH₵ %s–%s range.',
            number_format($rent, 0),
            number_format($budgetMin, 0),
            number_format($budgetMax, 0)
        );
    } elseif ($rent <= $budgetMax) {
        $budgetPoints = MATCH_WEIGHTS['budget'];
        $budgetDetail = sprintf(
            'GH₵ %s/month, inside the GH₵ %s–%s range.',
            number_format($rent, 0),
            number_format($budgetMin, 0),
            number_format($budgetMax, 0)
        );
    } else {
        $overshoot = ($rent - $budgetMax) / max(1.0, $budgetMax);
        $budgetPoints = (int)max(0, round(MATCH_WEIGHTS['budget'] * (1 - min(1.0, $overshoot))));
        $budgetDetail = sprintf(
            'GH₵ %s/month, above the GH₵ %s maximum by %s%%.',
            number_format($rent, 0),
            number_format($budgetMax, 0),
            number_format($overshoot * 100, 0)
        );
    }
    $breakdown[] = [
        'factor' => 'budget',
        'label'  => MATCH_FACTOR_LABELS['budget'],
        'points' => $budgetPoints,
        'max'    => MATCH_WEIGHTS['budget'],
        'detail' => $budgetDetail,
    ];

    // --- Location (20) -----------------------------------------------------
    $areaKey = match_area_key(explode(',', $propertyArea)[0]);
    $matchedArea = '';
    foreach ($preferred as $wanted) {
        $wantedKey = match_area_key($wanted);
        if ($wantedKey === '' || $areaKey === '') {
            continue;
        }
        if ($wantedKey === $areaKey
            || str_contains($areaKey, $wantedKey)
            || str_contains($wantedKey, $areaKey)
        ) {
            $matchedArea = $wanted;
            break;
        }
    }

    $locationPoints = $matchedArea !== '' ? MATCH_WEIGHTS['location'] : 0;
    $breakdown[] = [
        'factor' => 'location',
        'label'  => MATCH_FACTOR_LABELS['location'],
        'points' => $locationPoints,
        'max'    => MATCH_WEIGHTS['location'],
        'detail' => $preferred === []
            ? 'The request did not name a preferred area.'
            : ($matchedArea !== ''
                ? 'In ' . $matchedArea . '.'
                : 'Not in ' . implode(', ', array_slice($preferred, 0, 3)) . '.'),
    ];

    // --- Proximity (15) ----------------------------------------------------
    $proximityPoints = 0;
    $proximityDetail = 'No adjacency is recorded, so proximity is not scored.';
    if ($matchedArea !== '') {
        $proximityPoints = MATCH_WEIGHTS['proximity'];
        $proximityDetail = 'Already in a preferred area.';
    } else {
        $bestBand = null;
        $bestArea = '';
        foreach ($preferred as $wanted) {
            $band = area_adjacency_band($wanted, explode(',', $propertyArea)[0]);
            if ($band !== null && ($bestBand === null || $band < $bestBand)) {
                $bestBand = $band;
                $bestArea = $wanted;
            }
        }
        if ($bestBand !== null) {
            // Band 1 (next to) earns the full proximity weight, band 2 (near)
            // earns two thirds of it.
            $proximityPoints = $bestBand === 1
                ? MATCH_WEIGHTS['proximity']
                : (int)round(MATCH_WEIGHTS['proximity'] * 0.67);
            $proximityDetail = (AREA_ADJACENCY_BANDS[$bestBand] ?? 'Near') . ' ' . $bestArea . '.';
        } elseif ($preferred !== []) {
            $proximityDetail = 'No proximity is recorded between this area and the preferred areas.';
        } else {
            $proximityDetail = 'The request did not name a preferred area.';
        }
    }
    $breakdown[] = [
        'factor' => 'proximity',
        'label'  => MATCH_FACTOR_LABELS['proximity'],
        'points' => $proximityPoints,
        'max'    => MATCH_WEIGHTS['proximity'],
        'detail' => $proximityDetail,
    ];

    // --- Property type (10) ------------------------------------------------
    $wantedType = (string)($request['propertyType'] ?? '');
    $typePoints = 0;
    $typeDetail = 'The request did not name a property type.';
    if ($wantedType !== '' && strcasecmp($wantedType, 'All') !== 0) {
        if (strcasecmp($wantedType, (string)($property['propertyType'] ?? '')) === 0) {
            $typePoints = MATCH_WEIGHTS['type'];
            $typeDetail = 'Matches the requested ' . $wantedType . '.';
        } else {
            $typeDetail = 'A ' . (string)($property['propertyType'] ?? 'listing') . ', not a ' . $wantedType . '.';
        }
    }
    $breakdown[] = [
        'factor' => 'type',
        'label'  => MATCH_FACTOR_LABELS['type'],
        'points' => $typePoints,
        'max'    => MATCH_WEIGHTS['type'],
        'detail' => $typeDetail,
    ];

    // --- Bedrooms and bathrooms (10 each) ---------------------------------
    foreach ([
        ['bedrooms', $bedrooms, $wantedBedrooms, 'bedroom'],
        ['bathrooms', $bathrooms, $wantedBathrooms, 'bathroom'],
    ] as [$factor, $have, $want, $noun]) {
        if ($want <= 0) {
            $points = 0;
            $detail = 'The request did not specify ' . $noun . 's.';
        } elseif ($have >= $want) {
            $points = MATCH_WEIGHTS[$factor];
            $detail = $have . ' ' . $noun . ($have === 1 ? '' : 's') . ', at least the ' . $want . ' requested.';
        } elseif ($have === $want - 1) {
            $points = (int)round(MATCH_WEIGHTS[$factor] / 2);
            $detail = $have . ' ' . $noun . ($have === 1 ? '' : 's') . ', one short of the ' . $want . ' requested.';
        } else {
            $points = 0;
            $detail = $have . ' ' . $noun . ($have === 1 ? '' : 's') . ', fewer than the ' . $want . ' requested.';
        }
        $breakdown[] = [
            'factor' => $factor,
            'label'  => MATCH_FACTOR_LABELS[$factor],
            'points' => $points,
            'max'    => MATCH_WEIGHTS[$factor],
            'detail' => $detail,
        ];
    }

    $score = 0;
    foreach ($breakdown as $item) {
        $score += $item['points'];
    }
    $score = max(0, min(100, $score));

    return [
        'score'     => $score,
        'reason'    => match_reason($score, $breakdown),
        'breakdown' => $breakdown,
    ];
}

/**
 * One sentence a tenant can read. It names the strongest agreements and the
 * most important gap, rather than a generic claim.
 */
function match_reason(int $score, array $breakdown): string
{
    $strong = [];
    $gap = null;
    foreach ($breakdown as $item) {
        $ratio = $item['max'] > 0 ? $item['points'] / $item['max'] : 0;
        if ($ratio >= 1) {
            $strong[] = strtolower($item['label']);
        } elseif ($ratio < 1 && $item['points'] === 0 && $gap === null) {
            $gap = $item;
        }
    }

    $headline = match_score_band($score)['label'];

    $parts = [];
    if ($strong !== []) {
        $parts[] = 'matches on ' . implode(', ', array_slice($strong, 0, 3));
    }
    if ($gap !== null) {
        $parts[] = strtolower($gap['detail']);
    }

    return $headline . ($parts === [] ? '.' : ': ' . implode('; ', $parts) . '.');
}

/** The words used for a score, so the number is never shown alone. */
function match_score_band(int $score): array
{
    if ($score >= 85) {
        return ['label' => 'Strong match', 'band' => 'strong'];
    }
    if ($score >= 65) {
        return ['label' => 'Good match', 'band' => 'good'];
    }
    if ($score >= 45) {
        return ['label' => 'Possible match', 'band' => 'possible'];
    }
    return ['label' => 'Weak match', 'band' => 'weak'];
}
