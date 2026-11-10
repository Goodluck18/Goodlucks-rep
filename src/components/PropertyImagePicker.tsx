import React, { useRef, useState } from 'react';
import { AlertCircle, Image as ImageIcon, Link2, Upload, X } from 'lucide-react';
import { api, messageForError } from '../services/apiService';
import { IMAGE_ACCEPT, IMAGE_MAX_BYTES, dedupeFiles, formatBytes, validateImageFile } from '../lib/uploads';

/**
 * The one property-image picker (Upgrade 2, C3).
 *
 * Before this existed there were two listing forms and only one of them could
 * take photographs from the device: the landlord form uploaded files, while the
 * agent form accepted a single comma-separated URL string. Two forms, two
 * different levels of care. This component is now the only implementation, used
 * by `ListPropertyView` and `AgentListingForm`.
 *
 * It keeps every behaviour the landlord form already had, because those were
 * the right ones:
 *
 *   * files are validated before any network call (`validateImageFile`);
 *   * a repeated file is skipped rather than uploaded twice (`dedupeFiles`);
 *   * the upload is one request for the whole batch, and a partial failure keeps
 *     the images that did upload;
 *   * every tile can be removed, and the member's filename labels it;
 *   * only URLs are kept — never base64 blobs in the browser.
 *
 * Linking still works: a listing can point at an image that is already hosted.
 * A link is added one at a time and must be http(s), which is exactly what the
 * server accepts.
 */

interface SelectedImage {
  url: string;
  name: string;
  bytes: number;
}

export interface PropertyImagePickerProps {
  /** Current image URLs (the listing payload). */
  images: string[];
  /** Called with the new URL list whenever an image is added or removed. */
  onChange: (urls: string[]) => void;
  /** Lets the parent disable submission while a batch is still uploading. */
  onBusyChange?: (busy: boolean) => void;
  disabled?: boolean;
  idPrefix?: string;
  label?: string;
}

export const PropertyImagePicker: React.FC<PropertyImagePickerProps> = ({
  images,
  onChange,
  onBusyChange,
  disabled = false,
  idPrefix = 'property-image',
  label = 'Property images',
}) => {
  // Filenames and sizes are kept beside the URLs purely to label the preview;
  // the server only ever returns a URL.
  const [details, setDetails] = useState<Record<string, SelectedImage>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [link, setLink] = useState('');
  const linkInput = useRef<HTMLInputElement | null>(null);

  const setBusy = (busy: boolean) => {
    setUploading(busy);
    onBusyChange?.(busy);
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = event.target.files;
    if (!fileList || fileList.length === 0) return;

    setError(null);
    setNotice(null);

    const candidates: File[] = Array.from(fileList as unknown as ArrayLike<File>);
    const { accepted: unique, skipped } = dedupeFiles(
      candidates,
      Object.values(details).map((image: SelectedImage) => ({
        name: image.name,
        type: 'image/*',
        size: image.bytes,
      }))
    );

    const accepted: File[] = [];
    const problems: string[] = [];
    for (const file of unique) {
      const problem = validateImageFile(file, IMAGE_MAX_BYTES);
      if (problem) {
        problems.push(problem);
        continue;
      }
      accepted.push(file);
    }

    if (problems.length > 0) setError(problems[0]);
    if (skipped.length > 0) {
      setNotice(`${skipped.join(', ')} ${skipped.length === 1 ? 'was' : 'were'} already selected.`);
    }

    if (accepted.length === 0) {
      event.target.value = '';
      return;
    }

    setBusy(true);
    try {
      const result = await api.uploadImages(accepted);
      const uploaded: SelectedImage[] = result.urls.map((url, index) => ({
        url,
        name: accepted[index]?.name ?? `Image ${images.length + index + 1}`,
        bytes: accepted[index]?.size ?? 0,
      }));
      setDetails((prev) => {
        const next = { ...prev };
        for (const image of uploaded) next[image.url] = image;
        return next;
      });
      onChange([...images, ...uploaded.map((image) => image.url)]);
      if (result.warnings && result.warnings.length > 0) setNotice(result.warnings[0]);
    } catch (err) {
      setError(messageForError(err));
    } finally {
      setBusy(false);
      event.target.value = '';
    }
  };

  const remove = (url: string) => {
    setDetails((prev) => {
      const next = { ...prev };
      delete next[url];
      return next;
    });
    onChange(images.filter((candidate) => candidate !== url));
    setNotice(null);
    setError(null);
  };

  const addLink = () => {
    const value = link.trim();
    if (value === '') return;
    if (!/^https?:\/\//i.test(value)) {
      setError('Image links must start with http:// or https://.');
      return;
    }
    if (images.includes(value)) {
      setNotice('That image link is already on this listing.');
      return;
    }
    setDetails((prev) => ({
      ...prev,
      [value]: { url: value, name: value.split('/').pop() || 'Linked image', bytes: 0 },
    }));
    onChange([...images, value]);
    setLink('');
    setError(null);
    setNotice(null);
  };

  const disabledAll = disabled || uploading;

  return (
    <div className="space-y-4 pb-6 border-b border-line">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-ink flex items-center gap-2">
            <ImageIcon className="w-5 h-5 shrink-0" />
            {label}
          </h2>
          <p className="text-xs text-ink/70">Choose real photographs of the property you are listing.</p>
        </div>
        <span
          className={`text-xs font-semibold shrink-0 rounded-full px-2.5 py-1 border ${
            images.length === 0
              ? 'text-ink/70 bg-page border-line'
              : 'text-ink bg-interactive/10 border-interactive/30'
          }`}
        >
          {uploading
            ? 'Uploading…'
            : images.length === 0
              ? 'No images selected'
              : `${images.length} ${images.length === 1 ? 'image' : 'images'} selected`}
        </span>
      </div>

      <div
        className={`relative border-2 border-dashed rounded-2xl p-5 sm:p-6 text-center bg-surface transition-colors ${
          disabledAll ? 'border-interactive/40 opacity-70' : 'border-line hover:border-interactive'
        }`}
      >
        <input
          type="file"
          multiple
          accept={IMAGE_ACCEPT}
          onChange={handleFileUpload}
          disabled={disabledAll}
          aria-label="Choose property images"
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10 disabled:cursor-not-allowed"
        />
        <div className="flex flex-col items-center gap-2">
          <div className="w-12 h-12 rounded-full bg-interactive/10 text-ink flex items-center justify-center">
            {uploading ? (
              <span className="w-5 h-5 border-2 border-interactive/30 border-t-interactive rounded-full animate-spin" />
            ) : (
              <Upload className="w-6 h-6" />
            )}
          </div>
          <div className="text-sm font-semibold text-ink">
            {uploading ? 'Uploading your images…' : 'Click to upload or drag images here'}
          </div>
          <div className="text-xs text-ink/70">
            JPG, PNG, WEBP or GIF · up to {formatBytes(IMAGE_MAX_BYTES)} each
          </div>
        </div>
      </div>

      {/* Linking an already-hosted image stays available, one link at a time. */}
      <div className="flex flex-col sm:flex-row gap-2">
        <label className="flex-1 min-w-0">
          <span className="sr-only">Add an image by link</span>
          <input
            ref={linkInput}
            id={`${idPrefix}-link`}
            type="url"
            value={link}
            onChange={(event) => setLink(event.target.value)}
            placeholder="…or paste an https:// link to an image"
            className="w-full bg-page border border-line rounded-xl px-3 py-2 text-xs text-ink"
          />
        </label>
        <button
          type="button"
          onClick={addLink}
          disabled={disabledAll || link.trim() === ''}
          className="px-3 py-2 rounded-xl bg-page border border-line text-xs font-bold text-ink flex items-center justify-center gap-1.5 disabled:opacity-50"
        >
          <Link2 className="w-3.5 h-3.5" /> Add link
        </button>
      </div>

      {error && (
        <p role="alert" className="text-[11px] text-accent flex items-start gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span className="min-w-0 break-words">{error}</span>
        </p>
      )}

      {notice && (
        <p role="status" className="text-[11px] text-ink/70 flex items-start gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span className="min-w-0 break-words">{notice}</span>
        </p>
      )}

      {images.length > 0 ? (
        <ul className="grid grid-cols-1 min-[380px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 pt-1">
          {images.map((url, idx) => {
            const image = details[url] ?? { url, name: url.split('/').pop() || `Image ${idx + 1}`, bytes: 0 };
            return (
              <li key={`${url}-${idx}`} className="relative rounded-xl border border-line overflow-hidden bg-page">
                <div className="relative aspect-[4/3]">
                  <img
                    src={url}
                    alt={`Selected image ${idx + 1}: ${image.name}`}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-cover"
                  />
                  <span className="absolute top-1.5 left-1.5 text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded bg-surface/95 text-ink border border-line">
                    New
                  </span>
                  <button
                    type="button"
                    onClick={() => remove(url)}
                    aria-label={`Remove ${image.name}`}
                    title="Remove this image"
                    className="absolute top-1.5 right-1.5 p-1.5 rounded-full bg-surface/95 text-ink shadow-sm hover:bg-accent hover:text-white transition-colors min-h-[28px] min-w-[28px] flex items-center justify-center"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="px-2 py-1.5 min-w-0">
                  <p className="text-[10px] font-semibold text-ink truncate" title={image.name}>
                    {image.name}
                  </p>
                  {image.bytes > 0 && <p className="text-[9px] text-ink/70">{formatBytes(image.bytes)}</p>}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-[11px] text-ink/70">
          No images selected yet. A listing needs at least one photograph before it can be submitted for review.
        </p>
      )}
    </div>
  );
};
