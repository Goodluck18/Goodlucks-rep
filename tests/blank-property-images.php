<?php
/**
 * Remove the photographs from one listing, for the social-preview fallback test.
 *
 * Every listing created through the API must have at least one photograph, so a
 * listing without one only exists as legacy data (imported rows, or a photo
 * removed by hand). This fixture reproduces that state so the property page can
 * be shown to fall back to the site's default share image instead of emitting a
 * broken `og:image`.
 *
 *   php tests/blank-property-images.php --id=prop-123
 */

declare(strict_types=1);

require_once __DIR__ . '/../php-backend/config.php';

$id = '';
foreach ($argv as $argument) {
    if (str_starts_with($argument, '--id=')) {
        $id = substr($argument, 5);
    }
}

if ($id === '') {
    fwrite(STDERR, "Usage: blank-property-images.php --id=<property id>\n");
    exit(1);
}

$property = find_property($id);
if (!$property) {
    fwrite(STDERR, "No such property: {$id}\n");
    exit(1);
}

db_exec('UPDATE properties SET images = :images WHERE id = :id', [
    ':images' => '[]',
    ':id'     => $id,
]);

echo "Cleared images for {$id}\n";
