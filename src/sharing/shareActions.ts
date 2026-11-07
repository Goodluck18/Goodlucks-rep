/**
 * The three things a visitor can do with a generated poster: share it through
 * the device's own share sheet, download it, or copy the property's link.
 *
 * Every branch here has a failure mode in a real browser — `navigator.share`
 * missing, present but not able to take files, rejected by the user, clipboard
 * blocked on an insecure origin — so each function reports what actually
 * happened and the interface tells the visitor what to do instead. Nothing
 * fails silently.
 *
 * The browser objects are parameters rather than globals so the behaviours can
 * be tested without a browser.
 */

/**
 * The one approved caption. Short on purpose: the poster does the advertising,
 * the link takes the recipient to the listing. No description, no hashtags, no
 * sales copy.
 */
export const SHARE_CAPTION = 'View this property here:';

/** `View this property here:\nhttps://goodlucks.co/p/prop-1` */
export function shareText(shortUrl: string): string {
  return `${SHARE_CAPTION}\n${shortUrl}`;
}

/** The file name offered to the receiving app and to the downloads folder. */
export function posterMimeType(): string {
  return 'image/png';
}

export interface ShareNavigatorLike {
  share?: (data: ShareDataLike) => Promise<void>;
  canShare?: (data: { files?: unknown[] }) => boolean;
  clipboard?: { writeText: (text: string) => Promise<void> };
}

export interface ShareDataLike {
  title?: string;
  text?: string;
  url?: string;
  files?: unknown[];
}

export type ShareOutcome = 'shared' | 'cancelled' | 'unsupported' | 'failed';

/** True when this browser can attach the PNG to the share sheet. */
export function canSharePosterFile(
  nav: ShareNavigatorLike | undefined,
  file: unknown
): boolean {
  if (!nav || typeof nav.share !== 'function' || typeof nav.canShare !== 'function') return false;
  try {
    return nav.canShare({ files: [file] }) === true;
  } catch {
    return false;
  }
}

function isAbort(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && (error as { name?: string }).name === 'AbortError');
}

export interface SharePosterInput {
  nav: ShareNavigatorLike | undefined;
  /** Builds the shareable File; injected so tests need no real Blob. */
  createFile: () => unknown;
  fileName: string;
  title: string;
  shortUrl: string;
}

/**
 * Share the poster, with the short property link as the caption, through the
 * device's share sheet.
 *
 * Returns `unsupported` when the browser cannot attach files (Firefox desktop,
 * older Safari, some WebViews) — the caller then points the visitor at Download
 * + Copy link instead of doing nothing.
 */
export async function sharePoster(
  input: SharePosterInput
): Promise<{ outcome: ShareOutcome; fileAttached: boolean }> {
  const { nav, createFile, fileName, title, shortUrl } = input;

  const file = createFile();
  if (!canSharePosterFile(nav, file)) {
    return { outcome: 'unsupported', fileAttached: false };
  }

  try {
    await nav!.share!({
      files: [file],
      title,
      // The receiving app decides whether it keeps the text when a file is
      // attached; WhatsApp, Telegram and Mail generally do, Instagram and
      // Facebook usually do not. The interface keeps Copy link beside this
      // action for exactly that reason.
      text: shareText(shortUrl),
    });
    void fileName;
    return { outcome: 'shared', fileAttached: true };
  } catch (error) {
    if (isAbort(error)) return { outcome: 'cancelled', fileAttached: false };
    return { outcome: 'failed', fileAttached: false };
  }
}

export interface ShareLinkInput {
  nav: ShareNavigatorLike | undefined;
  title: string;
  text: string;
  url: string;
}

export type ShareLinkOutcome = 'shared' | 'cancelled' | 'copied' | 'failed';

/**
 * The existing "Share Property Link" behaviour, unchanged: the device share
 * sheet when there is one, the clipboard when there is not, and a clipboard
 * attempt if sharing was available but threw for a reason other than the user
 * closing the sheet.
 */
export async function sharePropertyLink(
  input: ShareLinkInput,
  copy: (text: string) => Promise<boolean>
): Promise<ShareLinkOutcome> {
  const { nav, title, text, url } = input;

  if (nav && typeof nav.share === 'function') {
    try {
      await nav.share({ title, text, url });
      return 'shared';
    } catch (error) {
      if (isAbort(error)) return 'cancelled';
      return (await copy(url)) ? 'copied' : 'failed';
    }
  }

  return (await copy(url)) ? 'copied' : 'failed';
}

/** Clipboard write with a `document.execCommand` fallback for older browsers. */
export async function copyToClipboard(
  text: string,
  nav: ShareNavigatorLike | undefined,
  doc: Document | undefined
): Promise<boolean> {
  if (nav?.clipboard && typeof nav.clipboard.writeText === 'function') {
    try {
      await nav.clipboard.writeText(text);
      return true;
    } catch {
      // fall through to the legacy path
    }
  }
  if (!doc?.body) return false;
  try {
    const area = doc.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    doc.body.appendChild(area);
    area.select();
    const copied = typeof doc.execCommand === 'function' ? doc.execCommand('copy') : false;
    doc.body.removeChild(area);
    return copied === true;
  } catch {
    return false;
  }
}

/**
 * Save the PNG through a temporary link.
 *
 * The object URL is revoked on the next tick rather than immediately: some
 * browsers cancel a download whose URL disappears in the same task.
 */
export function downloadBlob(
  blob: Blob,
  fileName: string,
  doc: Document | undefined,
  createObjectUrl: (blob: Blob) => string = (value) => URL.createObjectURL(value),
  revokeObjectUrl: (url: string) => void = (url) => URL.revokeObjectURL(url)
): boolean {
  if (!doc?.body) return false;
  let url: string;
  try {
    url = createObjectUrl(blob);
  } catch {
    return false;
  }
  try {
    const link = doc.createElement('a');
    link.href = url;
    link.download = fileName;
    link.rel = 'noopener';
    doc.body.appendChild(link);
    link.click();
    doc.body.removeChild(link);
    setTimeout(() => revokeObjectUrl(url), 0);
    return true;
  } catch {
    revokeObjectUrl(url);
    return false;
  }
}

/** `image/png` File for the share sheet; typed loosely for the test runner. */
export function createPosterFile(blob: Blob, fileName: string): File {
  return new File([blob], fileName, { type: posterMimeType() });
}
