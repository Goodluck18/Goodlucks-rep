/**
 * Upload rules shared by every file picker in the app.
 *
 * Why this module exists
 * ----------------------
 * The property form, the verification panel and the profile picture picker all
 * accept files, and each one of them used to answer three questions on its own:
 * is this the right kind of file, is it small enough, and what do we show the
 * member before anything is sent to the server? Keeping the answers here means
 * a picker can validate *before* uploading (so a 12 MB TIFF never leaves the
 * device) and the rules are unit-tested once instead of three times.
 *
 * Nothing here touches the network, the DOM, or React: every function takes
 * plain data and returns a plain result, which is what makes it testable in
 * Node without a browser.
 *
 * The limits mirror the server. The server remains the authority — these checks
 * only save a wasted round trip and give the member a message next to the field
 * they have to fix (php-backend/lib/private_storage.php for identity documents,
 * php-backend/lib/uploads.php for listing images).
 */

/** Listing images: 8 MB per file (matches the property form's existing limit). */
export const IMAGE_MAX_BYTES = 8 * 1024 * 1024;

/** Identity / authorisation documents: 5 MB per file (IDENTITY_DOCUMENT_MAX_BYTES). */
export const DOCUMENT_MAX_BYTES = 5 * 1024 * 1024;

/** What the image picker advertises and what the server will store. */
export const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;

/** What private storage accepts: PDF, JPG, PNG — and nothing else. */
export const DOCUMENT_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png'] as const;

export const DOCUMENT_ACCEPT = DOCUMENT_MIME_TYPES.join(',');
export const IMAGE_ACCEPT = IMAGE_MIME_TYPES.join(',');

/** The minimum a File-like object needs for these rules to be applied. */
export interface FileLike {
  name: string;
  type: string;
  size: number;
}

export type IdentityDocumentSlot = 'front' | 'back';

export interface IdentitySlotRule {
  /** Shown in the field label. */
  label: string;
  /** True when the slot must be filled before the form can be submitted. */
  required: boolean;
  /** The `kind` sent to POST /verification/documents. */
  kind: 'document_front' | 'document_back';
}

/** 1.4 MB, 812 KB, 0 KB — never a raw byte count in front of a member. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function extensionOf(name: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(name.trim());
  return match ? match[1].toLowerCase() : '';
}

function mimeAllowed(file: FileLike, allowed: readonly string[]): boolean {
  if (file.type && (allowed as readonly string[]).includes(file.type)) return true;

  // Some Android pickers and older browsers report an empty or generic type for
  // a valid file. Fall back to the extension so a real photograph is never
  // rejected just because the picker did not fill in `type`.
  const ext = extensionOf(file.name);
  const byExtension: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    gif: 'image/gif',
    pdf: 'application/pdf',
  };
  return (allowed as readonly string[]).includes(byExtension[ext] ?? '');
}

/**
 * Returns a message for the member, or `null` when the image is acceptable.
 * The message names the file so a multi-file selection can say which one failed.
 */
export function validateImageFile(file: FileLike, maxBytes: number = IMAGE_MAX_BYTES): string | null {
  if (!file || !file.name) return 'Choose an image to upload.';
  if (!mimeAllowed(file, IMAGE_MIME_TYPES)) {
    return `“${file.name}” is not an image. Use JPG, PNG, WEBP or GIF.`;
  }
  if (file.size > maxBytes) {
    return `“${file.name}” is ${formatBytes(file.size)}. The limit is ${formatBytes(maxBytes)}.`;
  }
  return null;
}

/** Same shape as `validateImageFile`, for identity/authorisation documents. */
export function validateDocumentFile(
  file: FileLike,
  maxBytes: number = DOCUMENT_MAX_BYTES
): string | null {
  if (!file || !file.name) return 'Choose a document to upload.';
  if (!mimeAllowed(file, DOCUMENT_MIME_TYPES)) {
    return `“${file.name}” is not a PDF, JPG or PNG.`;
  }
  if (file.size > maxBytes) {
    return `“${file.name}” is ${formatBytes(file.size)}. The limit is ${formatBytes(maxBytes)}.`;
  }
  return null;
}

/** True when a stored/picked file can be shown as an <img> thumbnail. */
export function isPreviewableImage(file: FileLike): boolean {
  return file.type.startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(extensionOf(file.name));
}

/**
 * A readable label for an image that is already stored on the server. Uploads
 * come back as URLs only, so the filename is the last path segment — decoded and
 * stripped of the random prefix the storage layer adds.
 */
export function fileNameFromUrl(url: string): string {
  const clean = url.split('?')[0].split('#')[0];
  const segment = clean.split('/').filter(Boolean).pop() ?? '';
  let decoded = segment;
  try {
    decoded = decodeURIComponent(segment);
  } catch {
    decoded = segment;
  }
  return decoded || 'Stored image';
}

/**
 * The two sides of an identity document.
 *
 * The platform's rule (php-backend/lib/verification.php) is that a Ghana Card is
 * checked from BOTH sides, and a front-only submission is refused. Every other
 * document type needs the front and may take a back. The form reads its labels
 * and its required markers from here so the two can never disagree again — the
 * old form called the back "optional" while the server rejected the submission.
 */
export function identityDocumentSlots(documentType: string): Record<IdentityDocumentSlot, IdentitySlotRule> {
  const isGhanaCard = documentType === 'ghana_card';
  return {
    front: {
      label: isGhanaCard ? 'Ghana Card — front' : 'Document — front',
      required: true,
      kind: 'document_front',
    },
    back: {
      label: isGhanaCard ? 'Ghana Card — back' : 'Document — back (optional)',
      required: isGhanaCard,
      kind: 'document_back',
    },
  };
}

/**
 * The client-side mirror of the server's before-submit check: a member must not
 * be able to press "Submit" for half a Ghana Card and then wait for a 422.
 *
 * `documentKinds` is every side that will be attached — the sides chosen in the
 * form *plus* the ones already on file. Returns the first problem, or `null`
 * when the submission is complete.
 */
export function identitySubmissionProblem(documentType: string, documentKinds: string[]): string | null {
  const kinds = new Set(documentKinds);
  const slots = identityDocumentSlots(documentType);
  const isGhanaCard = documentType === 'ghana_card';

  if (kinds.size === 0) return 'Add at least one document for the reviewer.';
  if (slots.front.required && !kinds.has(slots.front.kind)) {
    return isGhanaCard ? 'Upload the front of your Ghana Card.' : 'Add the front of your document.';
  }
  if (slots.back.required && !kinds.has(slots.back.kind)) {
    return 'Upload the back of your Ghana Card as well as the front.';
  }
  return null;
}

/** The same check for a form in which nothing is on file yet. */
export function identitySelectionProblem(
  documentType: string,
  selected: { front: unknown; back: unknown }
): string | null {
  const slots = identityDocumentSlots(documentType);
  const kinds: string[] = [];
  if (selected.front) kinds.push(slots.front.kind);
  if (selected.back) kinds.push(slots.back.kind);
  return identitySubmissionProblem(documentType, kinds);
}

/**
 * De-duplicates a multi-file selection by name + size so a double tap on the
 * picker cannot upload the same photograph twice. Returns the files to keep and
 * the names that were skipped.
 */
export function dedupeFiles<T extends FileLike>(files: T[], alreadySelected: FileLike[] = []): {
  accepted: T[];
  skipped: string[];
} {
  const seen = new Set(alreadySelected.map((file) => `${file.name}:${file.size}`));
  const accepted: T[] = [];
  const skipped: string[] = [];
  for (const file of files) {
    const key = `${file.name}:${file.size}`;
    if (seen.has(key)) {
      skipped.push(file.name);
      continue;
    }
    seen.add(key);
    accepted.push(file);
  }
  return { accepted, skipped };
}
