/**
 * Image/document selection rules — unit + structural tests.
 *
 * These cover the two defects this task fixed:
 *
 *   1. a brand-new listing form arrived with two stock photographs already in
 *      its image list, so it read "2 images selected" before the landlord had
 *      chosen anything;
 *   2. the verification form uploaded a document the moment it was picked and
 *      then cleared the input, so neither side of a Ghana Card could be seen,
 *      named or removed before submitting.
 *
 * The rule functions are tested directly (they are pure), and the components
 * are checked structurally — happy-dom has no layout engine and no file picker,
 * so a real "choose a file and look at the thumbnail" check needs a browser.
 * Everything asserted here is a property of the shipped source, not a guess.
 *
 *   npm run test:uploads
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  DOCUMENT_MAX_BYTES,
  IMAGE_MAX_BYTES,
  dedupeFiles,
  fileNameFromUrl,
  formatBytes,
  identityDocumentSlots,
  identitySelectionProblem,
  identitySubmissionProblem,
  isPreviewableImage,
  validateDocumentFile,
  validateImageFile,
} from '../src/lib/uploads.ts';

const root = path.resolve(import.meta.dirname, '..');
const read = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8');

const listProperty = read('src/components/ListPropertyView.tsx');
const verification = read('src/components/VerificationPanel.tsx');
const adminDashboard = read('src/components/AdminDashboard.tsx');
const accountSettings = read('src/components/dashboard/AccountSettingsView.tsx');
const apiClient = read('src/services/apiService.ts');
const apiHtaccess = read('php-backend/.htaccess');

const file = (name: string, type: string, size: number) => ({ name, type, size });

/* -------------------------------------------------------------------------- */
/* 1. Listing images                                                          */
/* -------------------------------------------------------------------------- */

test('a fresh listing form starts with no images', () => {
  // The state initialiser, not the rendered counter: an empty array is the only
  // thing that makes the "No images selected" state the first thing a landlord
  // sees.
  assert.match(
    listProperty,
    /const \[images, setImages\] = useState<SelectedImage\[\]>\(\[\]\)/,
    'ListPropertyView must initialise its image list empty'
  );
  // No stock photography may be seeded into a form anywhere in the app.
  const formsWithStockPhotos = [listProperty, verification, accountSettings].filter((source) =>
    /images\.unsplash\.com/.test(source)
  );
  assert.deepEqual(formsWithStockPhotos, [], 'no upload form may contain sample images');
});

test('the listing form never reports images before a file is chosen', () => {
  assert.match(listProperty, /No images selected/, 'the empty state must say so in words');
  assert.match(listProperty, /No images selected yet/, 'the empty state must explain what is missing');
});

test('the image picker validates type and size before uploading', () => {
  assert.match(listProperty, /validateImageFile\(file, IMAGE_MAX_BYTES\)/);
  assert.match(listProperty, /dedupeFiles\(/);
  assert.match(listProperty, /accept=\{IMAGE_ACCEPT\}/);
});

test('each selected image can be removed and is labelled with its filename', () => {
  assert.match(listProperty, /aria-label=\{`Remove \$\{image\.name\}`\}/);
  assert.match(listProperty, /title=\{image\.name\}/);
  assert.match(listProperty, /images\.map\(\(image\) => image\.url\)/, 'the payload sends URLs, not local files');
});

test('image validation accepts what the server accepts and refuses the rest', () => {
  assert.equal(validateImageFile(file('front.jpg', 'image/jpeg', 900_000)), null);
  assert.equal(validateImageFile(file('front.png', 'image/png', 1024)), null);
  assert.equal(validateImageFile(file('front.webp', 'image/webp', 1024)), null);
  assert.equal(validateImageFile(file('front.gif', 'image/gif', 1024)), null);

  assert.match(String(validateImageFile(file('brochure.pdf', 'application/pdf', 1024))), /not an image/);
  assert.match(String(validateImageFile(file('scam.exe', 'application/octet-stream', 10))), /not an image/);
  assert.match(String(validateImageFile(file('huge.jpg', 'image/jpeg', IMAGE_MAX_BYTES + 1))), /limit is 8\.0 MB/);
  assert.equal(validateImageFile(file('exactly.jpg', 'image/jpeg', IMAGE_MAX_BYTES)), null);

  // An Android picker that reports no MIME type for a real JPEG must not be
  // rejected, and an iPhone HEIC still has to be (the server cannot store it).
  assert.equal(validateImageFile(file('camera-upload.jpg', '', 2048)), null);
  assert.match(String(validateImageFile(file('IMG_0001.HEIC', 'image/heic', 2048))), /not an image/);
  assert.match(String(validateImageFile(file('', 'image/jpeg', 10))), /Choose an image/);
});

/* -------------------------------------------------------------------------- */
/* 2. Verification documents                                                  */
/* -------------------------------------------------------------------------- */

test('choosing a verification file does not upload it', () => {
  // The old code called the upload inside the input's onChange. Nothing may
  // call the upload API outside the submit handler now.
  assert.ok(!/void upload\(/.test(verification), 'the immediate-upload helper must be gone');
  assert.match(verification, /const selectIdentityDocument = \(slot: IdentityDocumentSlot, file: File \| null\) => \{/);

  const selectBody = verification.slice(
    verification.indexOf('const selectIdentityDocument'),
    verification.indexOf('const clearIdentityDocument')
  );
  assert.ok(!/api\.uploadVerificationDocument/.test(selectBody), 'selection must not touch the network');
  assert.match(selectBody, /URL\.createObjectURL/, 'selection must produce a local preview instead');
});

test('both sides of a Ghana Card are on screen together, each with its own field', () => {
  assert.match(verification, /slotId="front"/);
  assert.match(verification, /slotId="back"/);
  assert.match(verification, /Ghana Card — front/);
  assert.match(verification, /Ghana Card — back/);
  assert.match(verification, /grid grid-cols-1 sm:grid-cols-2 gap-3/);
  // The label no longer calls the back side optional for a Ghana Card.
  assert.ok(
    !/Back of document \(optional\)/.test(verification),
    'the back of a Ghana Card is required by the server and must not be labelled optional'
  );
  assert.match(verification, /required=\{documentType === 'ghana_card'\}/);
});

test('a selected document shows a thumbnail, filename, size and a clear indicator', () => {
  assert.match(verification, /alt=\{`Preview of \$\{selection\.file\.name\}`\}/);
  assert.match(verification, /title=\{selection\.file\.name\}/);
  assert.match(verification, /formatBytes\(selection\.file\.size\)/);
  assert.match(verification, /Choose a file — none selected/);
  assert.match(verification, /Ready — uploads when you submit/);
  assert.match(verification, /Uploading…/);
  assert.match(verification, /Uploaded — attached to this submission/);
  assert.match(verification, /Upload failed — press Submit again to retry/);
});

test('the back side is required for a Ghana Card and optional otherwise', () => {
  const card = identityDocumentSlots('ghana_card');
  assert.equal(card.front.required, true);
  assert.equal(card.back.required, true);
  assert.equal(card.front.kind, 'document_front');
  assert.equal(card.back.kind, 'document_back');

  const passport = identityDocumentSlots('passport');
  assert.equal(passport.front.required, true);
  assert.equal(passport.back.required, false);
  assert.match(passport.back.label, /optional/);
});

test('half a Ghana Card cannot be submitted', () => {
  assert.match(
    String(identitySelectionProblem('ghana_card', { front: {}, back: null })),
    /back of your Ghana Card/
  );
  assert.match(
    String(identitySelectionProblem('ghana_card', { front: null, back: {} })),
    /front of your Ghana Card/
  );
  assert.equal(identitySelectionProblem('ghana_card', { front: {}, back: {} }), null);
  assert.match(String(identitySelectionProblem('passport', { front: null, back: null })), /at least one document/);
  assert.equal(identitySelectionProblem('passport', { front: {}, back: null }), null);

  // The form checks what will *actually* be attached — chosen sides plus the
  // sides already on file — so keeping a saved back does not force a re-upload.
  assert.equal(identitySubmissionProblem('ghana_card', ['document_front', 'document_back']), null);
  assert.match(String(identitySubmissionProblem('ghana_card', ['document_front'])), /back of your Ghana Card/);
  assert.match(String(identitySubmissionProblem('ghana_card', ['document_back'])), /front of your Ghana Card/);
  assert.match(String(identitySubmissionProblem('ghana_card', [])), /at least one document/);
  assert.equal(identitySubmissionProblem('passport', ['document_front']), null);
  assert.match(String(identitySubmissionProblem('passport', ['document_back'])), /front of your document/);
  assert.ok(/identitySubmissionProblem\(documentType, \[\.\.\.kindsOnFile\]\)/.test(
    fs.readFileSync(path.join(root, 'src/components/VerificationPanel.tsx'), 'utf8')
  ), 'the form must use the shared rule');
});

test('document validation matches private storage (PDF, JPG, PNG up to 5 MB)', () => {
  assert.equal(validateDocumentFile(file('card-front.jpg', 'image/jpeg', 1_500_000)), null);
  assert.equal(validateDocumentFile(file('card.pdf', 'application/pdf', 3_000_000)), null);
  assert.equal(validateDocumentFile(file('card.png', 'image/png', 10)), null);
  assert.equal(validateDocumentFile(file('exactly.pdf', 'application/pdf', DOCUMENT_MAX_BYTES)), null);

  assert.match(String(validateDocumentFile(file('card.docx', 'application/msword', 10))), /not a PDF, JPG or PNG/);
  assert.match(
    String(validateDocumentFile(file('big.pdf', 'application/pdf', DOCUMENT_MAX_BYTES + 1))),
    /limit is 5\.0 MB/
  );
});

test('submission uploads every required document once and keeps selections on failure', () => {
  // Both sides are uploaded inside the submit handler, in order.
  const submitBody = verification.slice(
    verification.indexOf('const submitIdentity = async'),
    verification.indexOf('const submitProfessional = async')
  );
  assert.match(submitBody, /await uploadIdentitySlot\('front'\)/);
  assert.match(submitBody, /await uploadIdentitySlot\('back'\)/);
  assert.match(submitBody, /documentIds: ids/);

  // A rejected submission leaves the files in place, so they do not have to be
  // chosen again.
  assert.match(submitBody, /The selections stay exactly as they were/);
  assert.ok(!/setIdentitySlots\(\{ front: null, back: null \}\)/.test(submitBody.split('catch')[1] ?? ''));

  // An uploaded file is not re-sent on retry.
  assert.match(verification, /if \(current\.documentId\) return current\.documentId;/);

  // Double taps cannot start a second submission.
  assert.match(verification, /if \(submittingRef\.current\) return;/);
  assert.match(verification, /disabled=\{busy \|\| submitting !== null\}/);
});

test('a replacement document does not delete the stored one', () => {
  assert.match(verification, /The saved file is left in storage \(nothing is\s+\/\/ deleted here\)/);
  assert.ok(!/submitIdentity[\s\S]{0,2000}deleteVerificationDocument/.test(
    verification.slice(verification.indexOf('const submitIdentity = async'))
  ), 'submitting must not delete documents');
});

test('the admin listing editor keeps saved images and marks new ones', () => {
  assert.match(adminDashboard, /Saved' : 'New'/, 'saved vs new must be visible on each tile');
  assert.match(adminDashboard, /Already on this listing/);
  assert.match(adminDashboard, /the stored file is not deleted/);
  assert.match(adminDashboard, /addEditImages/);
  assert.match(adminDashboard, /api\.uploadImages\(accepted\)/);
});

/* -------------------------------------------------------------------------- */
/* 3. Small helpers                                                           */
/* -------------------------------------------------------------------------- */

test('formatBytes never shows a bare byte count', () => {
  assert.equal(formatBytes(0), '0 KB');
  assert.equal(formatBytes(2048), '2 KB');
  assert.equal(formatBytes(812 * 1024), '812 KB');
  assert.equal(formatBytes(1.4 * 1024 * 1024), '1.4 MB');
});

test('a stored image URL becomes a readable filename', () => {
  assert.equal(fileNameFromUrl('https://example.test/uploads/abc123/kitchen.jpg'), 'kitchen.jpg');
  assert.equal(fileNameFromUrl('https://example.test/u/a/living%20room.webp?w=800'), 'living room.webp');
  assert.equal(fileNameFromUrl(''), 'Stored image');
});

test('only images get an <img> thumbnail', () => {
  assert.equal(isPreviewableImage(file('front.jpg', 'image/jpeg', 1)), true);
  assert.equal(isPreviewableImage(file('scan.pdf', 'application/pdf', 1)), false);
  assert.equal(isPreviewableImage(file('scan.pdf', '', 1)), false);
});

test('the same file cannot be queued twice', () => {
  const { accepted, skipped } = dedupeFiles(
    [file('a.jpg', 'image/jpeg', 10), file('b.jpg', 'image/jpeg', 20), file('a.jpg', 'image/jpeg', 10)],
    [file('b.jpg', 'image/jpeg', 20)]
  );
  assert.deepEqual(accepted.map((entry) => entry.name), ['a.jpg']);
  assert.deepEqual(skipped, ['b.jpg', 'a.jpg']);
});

/* -------------------------------------------------------------------------- */
/* 4. Upload endpoint path (Upgrade 2, A1)                                    */
/* -------------------------------------------------------------------------- */

test('the client posts to the upload path with its trailing slash', () => {
  // `api/uploads` is a real directory on the deployed host. Apache's mod_dir
  // answers `/api/uploads` with a 301 to `/api/uploads/`, and a browser re-sends
  // a redirected POST as a GET — which came back "Endpoint not found." The client
  // therefore posts to the slashed path, which the server routes identically.
  assert.match(apiClient, /request<\{ urls: string\[\]; warnings\?: string\[\] \}>\('\/uploads\/',/);
  assert.ok(
    !/request<\{ urls: string\[\]; warnings\?: string\[\] \}>\(\/uploads\',/.test(apiClient),
    'the bare path must not be posted to'
  );
});

test('the API directory routes the bare upload path before Apache serves it as a directory', () => {
  const rule = /RewriteRule \^uploads\/\?\$ index\.php \[L,QSA\]/;
  assert.match(apiHtaccess, rule, 'the bare upload directory must reach the front controller');

  // Order matters: the rewrite has to appear before the static-file rule, or
  // mod_dir/directory handling wins. Compare the two offsets.
  const ruleAt = apiHtaccess.search(rule);
  const staticAt = apiHtaccess.indexOf('Serve already-uploaded images directly');
  assert.ok(ruleAt > -1 && staticAt > -1 && ruleAt < staticAt, 'the upload rewrite must come first');

  // Uploaded files are still static: the directory's own .htaccess stays strict.
  const uploadsHtaccess = read('php-backend/uploads/.htaccess');
  assert.match(uploadsHtaccess, /RemoveHandler \.php/);
  assert.match(uploadsHtaccess, /Require all denied/);
});
