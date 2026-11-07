import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Image as ImageIcon, Link2, Loader2, Share2, X } from 'lucide-react';
import type { Property } from '../types';
import { useApp } from '../context/AppContext';
import { useModalA11y } from '../hooks/useModalA11y';
import {
  moneyLabel,
  propertyCanonicalUrl,
  propertyIsShareable,
  propertyShortUrl,
  rentPeriodLabel,
  propertyShareDescription,
} from '../routing/propertyUrl';
import { generatePropertyPoster, type PosterArtifact } from '../sharing/posterRenderer';
import {
  copyToClipboard,
  createPosterFile,
  downloadBlob,
  sharePoster,
  sharePropertyLink,
} from '../sharing/shareActions';
import { BRAND_HANDLE } from '../config/brand';

type Stage = 'menu' | 'generating' | 'preview' | 'error';

interface SharePropertyModalProps {
  property: Property | null;
  isOpen: boolean;
  onClose: () => void;
}

/**
 * One place for both ways of sharing a listing.
 *
 * The old behaviour is intact and one click away — "Share Property Link" runs the
 * same Web Share / clipboard path the Share button used before. "Share as Image"
 * generates the 1080 × 1350 poster on demand (never while browsing), shows it for
 * approval, and then offers share / download / copy-link / close.
 */
export const SharePropertyModal: React.FC<SharePropertyModalProps> = ({ property, isOpen, onClose }) => {
  const { showSuccessToast, showErrorToast, showInfoToast } = useApp();
  const dialogRef = useRef<HTMLDivElement>(null);
  const dialogProps = useModalA11y(dialogRef, onClose, isOpen);

  const [stage, setStage] = useState<Stage>('menu');
  const [artifact, setArtifact] = useState<PosterArtifact | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Guards against a second generation from a double click or a second tap.
  const generating = useRef(false);
  const artifactRef = useRef<PosterArtifact | null>(null);
  // Mirrors `isOpen` for async work: a poster that finishes after the visitor
  // closed the dialog must not keep its blob in memory.
  const openRef = useRef(isOpen);
  openRef.current = isOpen;

  const release = useCallback(() => {
    if (artifactRef.current) {
      URL.revokeObjectURL(artifactRef.current.objectUrl);
      artifactRef.current = null;
    }
    setArtifact(null);
  }, []);

  // Reset everything when the dialog closes, and revoke the PNG's object URL so
  // repeated opens do not accumulate blobs in memory.
  useEffect(() => {
    if (!isOpen) {
      generating.current = false;
      release();
      setStage('menu');
      setNotice(null);
      setErrorMessage(null);
    }
  }, [isOpen, release]);

  useEffect(() => () => release(), [release]);

  if (!isOpen || !property) return null;

  const shareable = propertyIsShareable(property);
  const canonicalUrl = propertyCanonicalUrl(property);
  const shortUrl = propertyShortUrl(property);
  const summary = propertyShareDescription(property);

  const close = () => onClose();

  const copyLink = async (): Promise<boolean> => {
    const copied = await copyToClipboard(
      shortUrl,
      typeof navigator === 'undefined' ? undefined : (navigator as unknown as Parameters<typeof copyToClipboard>[1]),
      typeof document === 'undefined' ? undefined : document
    );
    if (copied) showSuccessToast('Short link copied', shortUrl);
    else showErrorToast('Could not copy the link', 'Select the link and copy it manually.');
    return copied;
  };

  /**
   * The existing share behaviour, unchanged: the device share sheet, or the
   * clipboard when the browser has no share sheet.
   */
  const handleShareLink = async () => {
    const outcome = await sharePropertyLink(
      {
        nav: typeof navigator === 'undefined' ? undefined : (navigator as unknown as Parameters<typeof sharePropertyLink>[0]['nav']),
        title: property.title,
        text: `Check out this rental property on Goodlucks Homes: ${property.title} in ${property.location} (${summary})`,
        url: canonicalUrl,
      },
      async (text) => {
        const copied = await copyToClipboard(
          text,
          typeof navigator === 'undefined' ? undefined : (navigator as unknown as Parameters<typeof copyToClipboard>[1]),
          typeof document === 'undefined' ? undefined : document
        );
        return copied;
      }
    );

    if (outcome === 'shared') {
      showSuccessToast('Shared Successfully', 'Property link shared with your contacts!');
      close();
      return;
    }
    if (outcome === 'copied') {
      showSuccessToast('Link Copied', 'Property link copied to clipboard!');
      close();
      return;
    }
    if (outcome === 'cancelled') return;
    showErrorToast('Sharing is unavailable', 'Use Copy Link to share this property instead.');
  };

  const handleGenerate = async () => {
    if (generating.current) return;
    generating.current = true;
    setStage('generating');
    setNotice(null);
    setErrorMessage(null);
    try {
      release();
      const result = await generatePropertyPoster(property);
      if (!openRef.current) {
        // The dialog was closed while the image was being built.
        URL.revokeObjectURL(result.objectUrl);
        return;
      }
      artifactRef.current = result;
      setArtifact(result);
      setStage('preview');
    } catch (error) {
      setStage('error');
      setErrorMessage(
        error instanceof Error && error.message
          ? error.message
          : 'The poster could not be generated on this device.'
      );
    } finally {
      generating.current = false;
    }
  };

  const handleShareImage = async () => {
    if (!artifact) return;
    const result = await sharePoster({
      nav: typeof navigator === 'undefined' ? undefined : (navigator as unknown as Parameters<typeof sharePoster>[0]['nav']),
      createFile: () => createPosterFile(artifact.blob, artifact.fileName),
      fileName: artifact.fileName,
      title: property.title,
      shortUrl,
    });

    if (result.outcome === 'shared') {
      showSuccessToast(
        'Poster shared',
        'The property link is in the caption. Some apps drop it on an image — Copy Link is there if yours does.'
      );
      return;
    }
    if (result.outcome === 'cancelled') return;

    setNotice(
      'This browser cannot attach the image to a share sheet. Download the poster, then paste the copied link into your post — that is how WhatsApp Status, Facebook and Instagram work too.'
    );
    if (result.outcome === 'unsupported') {
      showInfoToast('Download and share', 'Use Download Image, then paste the copied property link.');
    } else {
      showErrorToast('Sharing failed', 'Download the poster and share it from your gallery instead.');
    }
  };

  const handleDownload = () => {
    if (!artifact) return;
    const saved = downloadBlob(artifact.blob, artifact.fileName, typeof document === 'undefined' ? undefined : document);
    if (saved) {
      showSuccessToast('Poster downloaded', `${artifact.fileName} is in your downloads.`);
      setNotice('Poster saved. Copy the property link and paste it with the image in your post.');
    } else {
      showErrorToast('Download failed', 'Long-press the poster to save it instead.');
    }
  };

  const titleId = 'share-property-modal-title';

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-ink/60 backdrop-blur-md animate-fadeIn p-2 sm:p-4 flex items-center justify-center"
      onClick={close}
    >
      <div
        ref={dialogRef}
        {...dialogProps}
        id="share-property-modal"
        aria-labelledby={titleId}
        className="relative w-full max-w-md bg-surface border border-line rounded-2xl p-5 sm:p-6 shadow-lg text-ink my-auto max-h-[92vh] overflow-y-auto focus:outline-none"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={close}
          className="absolute top-4 right-4 p-2 rounded-full bg-page hover:bg-line text-ink/70 hover:text-ink transition-colors z-10"
          aria-label="Close share dialog"
        >
          <X className="w-5 h-5" />
        </button>

        <h2 id={titleId} className="text-lg font-black text-ink pr-10">
          {stage === 'preview' ? 'Your property poster' : 'Share this property'}
        </h2>
        <p className="text-xs text-ink/70 mt-1">
          {property.title} · {moneyLabel(property.rentGhs)}
          {rentPeriodLabel(property)} · {property.location}
        </p>

        {stage === 'menu' && (
          <div className="mt-5 space-y-2.5">
            <button
              type="button"
              onClick={handleShareLink}
              className="w-full flex items-start gap-3 p-4 rounded-2xl border border-line bg-surface hover:border-interactive transition-colors text-left"
            >
              <span className="p-2 rounded-xl bg-interactive/20 text-ink">
                <Link2 className="w-5 h-5" />
              </span>
              <span className="flex-1">
                <span className="block text-sm font-bold text-ink">Share Property Link</span>
                <span className="block text-xs text-ink/70 mt-0.5">
                  Send the listing's canonical page through your device's share sheet.
                </span>
              </span>
            </button>

            <button
              type="button"
              onClick={handleGenerate}
              disabled={!shareable}
              aria-disabled={!shareable}
              className="w-full flex items-start gap-3 p-4 rounded-2xl border border-line bg-surface hover:border-accent transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="p-2 rounded-xl bg-accent/10 text-accent-text">
                <ImageIcon className="w-5 h-5" />
              </span>
              <span className="flex-1">
                <span className="block text-sm font-bold text-ink">Share as Image</span>
                <span className="block text-xs text-ink/70 mt-0.5">
                  {shareable
                    ? 'Create a branded 1080 × 1350 poster, then download or share it.'
                    : 'Only a published listing can be turned into a poster.'}
                </span>
              </span>
            </button>

            <p className="text-[11px] text-ink/70 pt-1">
              The poster carries {BRAND_HANDLE} and the site address, so anyone who saves it knows where to look.
            </p>
          </div>
        )}

        {stage === 'generating' && (
          <div className="mt-8 mb-6 flex flex-col items-center gap-3" role="status" aria-live="polite">
            <Loader2 className="w-8 h-8 text-accent animate-spin" />
            <p className="text-sm font-semibold text-ink">Preparing your poster…</p>
            <p className="text-xs text-ink/70 text-center">
              Loading the property photograph and building the image at full size.
            </p>
          </div>
        )}

        {stage === 'error' && (
          <div className="mt-5 space-y-3">
            <p className="text-sm text-ink">{errorMessage}</p>
            <p className="text-xs text-ink/70">
              The property link can still be shared and copied.
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <button type="button" onClick={handleGenerate} className="gl-btn gl-btn-primary text-sm flex-1">
                Try again
              </button>
              <button type="button" onClick={() => setStage('menu')} className="gl-btn gl-btn-secondary text-sm flex-1">
                Back
              </button>
            </div>
          </div>
        )}

        {stage === 'preview' && artifact && (
          <div className="mt-4 space-y-3">
            <div className="rounded-2xl border border-line bg-page p-2">
              <img
                src={artifact.objectUrl}
                width={1080}
                height={1350}
                alt={`Property poster for ${property.title} in ${property.location}`}
                className="w-full max-w-[340px] mx-auto rounded-xl shadow-sm"
              />
            </div>

            {artifact.usedPlaceholder && (
              <p className="text-[11px] text-ink/70">
                This listing has no usable photograph yet, so the poster uses the designed placeholder.
              </p>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button type="button" onClick={handleShareImage} className="gl-btn gl-btn-primary text-xs">
                <Share2 className="w-4 h-4" />
                Share Image
              </button>
              <button type="button" onClick={handleDownload} className="gl-btn gl-btn-secondary text-xs">
                <Download className="w-4 h-4" />
                Download Image
              </button>
              <button type="button" onClick={copyLink} className="gl-btn gl-btn-secondary text-xs">
                <Link2 className="w-4 h-4" />
                Copy Property Link
              </button>
              <button type="button" onClick={close} className="gl-btn gl-btn-ghost text-xs">
                Close
              </button>
            </div>

            <div className="rounded-xl bg-page border border-line p-3">
              <p className="text-[11px] font-semibold text-ink">Short property link</p>
              <p className="text-[11px] text-ink/70 break-all mt-0.5">{shortUrl}</p>
              <p className="text-[11px] text-ink/70 mt-2">
                Share Image attaches the poster and puts this link in the caption. WhatsApp Status, Facebook and
                Instagram usually drop a caption from an image — download the poster, then paste the link into your
                post.
              </p>
            </div>

            {notice && (
              <p className="text-[11px] text-ink bg-interactive/15 border border-interactive/40 rounded-xl p-3" role="status">
                {notice}
              </p>
            )}

            <button
              type="button"
              onClick={() => {
                release();
                setStage('menu');
                setNotice(null);
              }}
              className="text-[11px] font-semibold text-interactive-text hover:underline"
            >
              Use a different sharing option
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
