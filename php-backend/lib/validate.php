<?php
/**
 * Goodlucks Homes - Input validation & sanitisation helpers
 *
 * Every value that reaches the database goes through these helpers:
 *  - strings are trimmed, control characters removed and length-capped
 *  - emails/phones/dates/numbers are explicitly validated
 *  - enumerations are checked against an allow-list
 */

declare(strict_types=1);

const PROPERTY_TYPES = ['Apartment', 'Luxury Villa', 'Townhouse', 'Studio', 'Duplex', 'Penthouse', 'Commercial'];
const PROPERTY_STATUSES = ['active', 'pending', 'rejected', 'rented', 'deactivated'];
const ENQUIRY_STATUSES = ['new', 'contacted', 'closed'];
const REQUEST_STATUSES = ['submitted', 'searching', 'matched', 'viewing_scheduled', 'completed', 'cancelled'];
const VIEWING_STATUSES = ['scheduled', 'completed', 'cancelled'];
const USER_ROLES = ['tenant', 'landlord', 'admin'];

/** Trim, normalise and length-cap a string. */
function clean_string($value, int $maxLength = 1000): string
{
    if (is_array($value) || is_object($value)) {
        return '';
    }
    $string = (string)$value;
    $string = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $string) ?? '';
    $string = trim($string);
    if (function_exists('mb_substr')) {
        return mb_substr($string, 0, $maxLength, 'UTF-8');
    }
    return substr($string, 0, $maxLength);
}

/** Trim a multiline string (keeps newlines), length-capped. */
function clean_text($value, int $maxLength = 8000): string
{
    if (is_array($value) || is_object($value)) {
        return '';
    }
    $string = (string)$value;
    $string = str_replace(["\r\n", "\r"], "\n", $string);
    $string = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $string) ?? '';
    $string = trim($string);
    if (function_exists('mb_substr')) {
        return mb_substr($string, 0, $maxLength, 'UTF-8');
    }
    return substr($string, 0, $maxLength);
}

function valid_email($value): ?string
{
    if (!is_string($value)) {
        return null;
    }
    $email = strtolower(trim($value));
    if ($email === '' || strlen($email) > 254) {
        return null;
    }
    $valid = filter_var($email, FILTER_VALIDATE_EMAIL);
    return $valid === false ? null : $email;
}

/**
 * Ghana-friendly phone validation: accepts "+233 24 123 4567", "0241234567",
 * "233241234567" and common separators. Requires 9-15 digits.
 */
function valid_phone($value): ?string
{
    if (!is_string($value)) {
        return null;
    }
    $raw = trim($value);
    if ($raw === '' || strlen($raw) > 32) {
        return null;
    }
    if (!preg_match('/^\+?[0-9][0-9\s\-().]*$/', $raw)) {
        return null;
    }
    $digits = preg_replace('/\D+/', '', $raw) ?? '';
    if (strlen($digits) < 9 || strlen($digits) > 15) {
        return null;
    }
    return $raw;
}

function valid_int($value, ?int $min = null, ?int $max = null): ?int
{
    if (is_bool($value) || $value === null || $value === '') {
        return null;
    }
    if (is_string($value)) {
        $value = trim($value);
        if ($value === '' || !preg_match('/^-?\d+$/', $value)) {
            return null;
        }
    }
    if (!is_numeric($value)) {
        return null;
    }
    $int = (int)$value;
    if (is_string($value) && (string)$int !== ltrim($value, '+')) {
        // Reject "12abc" style input that PHP would silently cast
        if (!preg_match('/^-?\d+$/', (string)$value)) {
            return null;
        }
    }
    if ($min !== null && $int < $min) {
        return null;
    }
    if ($max !== null && $int > $max) {
        return null;
    }
    return $int;
}

function valid_money($value, float $min = 0, float $max = 100000000): ?float
{
    if ($value === null || $value === '' || is_bool($value)) {
        return null;
    }
    if (!is_numeric($value)) {
        return null;
    }
    $amount = (float)$value;
    if (!is_finite($amount) || $amount < $min || $amount > $max) {
        return null;
    }
    return round($amount, 2);
}

function valid_date_iso($value): ?string
{
    if (!is_string($value)) {
        return null;
    }
    $raw = trim($value);
    if ($raw === '') {
        return null;
    }
    $date = DateTimeImmutable::createFromFormat('!Y-m-d', $raw, new DateTimeZone('UTC'));
    if (!$date || $date->format('Y-m-d') !== $raw) {
        return null;
    }
    return $raw;
}

/** Pick a value from an allow-list, otherwise return $default. */
function one_of($value, array $allowed, ?string $default = null): ?string
{
    if (is_string($value) && in_array($value, $allowed, true)) {
        return $value;
    }
    return $default;
}

/** Sanitised array of short strings (amenities, images, locations). */
function clean_string_list($value, int $maxItems = 30, int $maxLength = 500): array
{
    if (is_string($value)) {
        $value = preg_split('/\r\n|\r|\n|,/', $value) ?: [];
    }
    if (!is_array($value)) {
        return [];
    }
    $out = [];
    foreach ($value as $item) {
        if (is_array($item)) {
            continue;
        }
        $clean = clean_string($item, $maxLength);
        if ($clean !== '' && !in_array($clean, $out, true)) {
            $out[] = $clean;
        }
        if (count($out) >= $maxItems) {
            break;
        }
    }
    return $out;
}

/** Sanitised list of {name,type,distance} nearby place objects. */
function clean_nearby_places($value, int $maxItems = 12): array
{
    if (!is_array($value)) {
        return [];
    }
    $out = [];
    foreach ($value as $place) {
        if (!is_array($place)) {
            continue;
        }
        $name = clean_string($place['name'] ?? '', 120);
        if ($name === '') {
            continue;
        }
        $out[] = [
            'name'     => $name,
            'type'     => clean_string($place['type'] ?? 'Landmark', 60),
            'distance' => clean_string($place['distance'] ?? '', 40),
        ];
        if (count($out) >= $maxItems) {
            break;
        }
    }
    return $out;
}

/**
 * Simple collector for field-level validation errors.
 */
final class Validator
{
    private array $errors = [];

    public function add(string $field, string $message): void
    {
        if (!isset($this->errors[$field])) {
            $this->errors[$field] = $message;
        }
    }

    public function required(string $field, $value, string $label, int $minLength = 1): void
    {
        $string = clean_string($value, 2000);
        if ($string === '' || (function_exists('mb_strlen') ? mb_strlen($string) : strlen($string)) < $minLength) {
            $this->add($field, $label . ' is required.');
        }
    }

    public function email(string $field, $value): void
    {
        if (valid_email($value) === null) {
            $this->add($field, 'Enter a valid email address.');
        }
    }

    public function phone(string $field, $value, bool $required = true): void
    {
        if (!$required && (is_string($value) && trim($value) === '')) {
            return;
        }
        if (valid_phone($value) === null) {
            $this->add($field, 'Enter a valid phone number (e.g. +233 24 123 4567).');
        }
    }

    public function fails(): bool
    {
        return !empty($this->errors);
    }

    public function errors(): array
    {
        return $this->errors;
    }
}

/** Escape a value for safe use inside HTML (used in transactional emails). */
function e($value): string
{
    return htmlspecialchars((string)$value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}
