/**
 * Account settings tests — password change and profile picture (Task 02).
 *
 * These run in their own file, with their own PHP server, database and upload
 * folder. Two reasons:
 *
 *  - Isolation: they change passwords, delete sessions and write image files.
 *    Keeping them away from the shared API suite means no other test depends on
 *    that side-effect-free, and a failure here cannot cascade.
 *  - Stability: the shared suite is already long; under the PHP-WASM fallback
 *    (used when no native PHP is installed) the single server process becomes
 *    unresponsive after enough traffic. A separate process keeps each run short.
 *
 *   npm run test:api
 */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { startApiServer } from '../scripts/php.mjs';
import { ApiClient, createPng } from './helpers.mjs';

const projectRoot = path.resolve(import.meta.dirname, '..');
const dataDir = path.join(projectRoot, '.data');
const dbPath = path.join(dataDir, `account-${process.pid}-${Date.now()}.sqlite`);
// Avatars land in a throwaway folder, not in php-backend/uploads, so a test run
// never leaves image files behind in the working tree.
const uploadDir = path.join(dataDir, `uploads-${process.pid}-${Date.now()}`);
const port = 8300 + Math.floor(Math.random() * 500);

let server;
let baseUrl;
let guest;

const uniqueEmail = (prefix) =>
  `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}@example.com`;

before(async () => {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(uploadDir, { recursive: true });
  for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(dbPath + suffix, { force: true });
  }

  server = await startApiServer({
    port,
    quiet: true,
    env: {
      DB_DRIVER: 'sqlite',
      DB_SQLITE_PATH: dbPath,
      APP_ENV: 'development',
      EMAIL_TRANSPORT: 'none',
      // Several accounts are registered from one loopback address here.
      REGISTER_RATE_LIMIT_PER_HOUR: '60',
      UPLOAD_DIR: uploadDir,
      UPLOAD_URL_PATH: '/api/uploads',
    },
  });
  baseUrl = server.baseUrl;
  guest = new ApiClient(baseUrl);
});

after(() => {
  server?.stop();
  fs.rmSync(uploadDir, { recursive: true, force: true });
  for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(dbPath + suffix, { force: true });
  }
});

describe('Account settings (password & profile picture)', () => {
  const account = { email: uniqueEmail('settings'), password: 'Settings-Password-123', client: null };

  test('a signed-in member can change their own password', async () => {
    const client = new ApiClient(baseUrl);
    const registered = await client.post('/api/auth/register', {
      email: account.email,
      password: account.password,
      name: 'Settings Tenant',
      phone: '+233 24 777 8899',
      role: 'tenant',
    });
    assert.equal(registered.status, 201, JSON.stringify(registered.body));
    account.client = client;

    // The current password is required and is verified server-side.
    const wrong = await client.post('/api/account/password', {
      currentPassword: 'not-my-password',
      newPassword: 'Brand-New-Password-456',
      confirmPassword: 'Brand-New-Password-456',
    });
    assert.equal(wrong.status, 422);
    assert.ok(wrong.body.fields.currentPassword);

    // Strength rule and confirmation are enforced.
    const weak = await client.post('/api/account/password', {
      currentPassword: account.password,
      newPassword: 'short',
      confirmPassword: 'short',
    });
    assert.equal(weak.status, 422);
    assert.ok(weak.body.fields.newPassword);

    const mismatch = await client.post('/api/account/password', {
      currentPassword: account.password,
      newPassword: 'Brand-New-Password-456',
      confirmPassword: 'Brand-New-Password-457',
    });
    assert.equal(mismatch.status, 422);
    assert.ok(mismatch.body.fields.confirmPassword);

    const changed = await client.post('/api/account/password', {
      currentPassword: account.password,
      newPassword: 'Brand-New-Password-456',
      confirmPassword: 'Brand-New-Password-456',
    });
    assert.equal(changed.status, 200, JSON.stringify(changed.body));
    assert.match(changed.body.message, /password/i);

    // The session that made the change survives.
    const me = await client.get('/api/auth/me');
    assert.equal(me.body.user.email, account.email);

    // Reusing the new password as the "current" one is refused.
    const same = await client.post('/api/account/password', {
      currentPassword: 'Brand-New-Password-456',
      newPassword: 'Brand-New-Password-456',
      confirmPassword: 'Brand-New-Password-456',
    });
    assert.equal(same.status, 422);
  });

  test('the old password stops working and the new one signs in', async () => {
    const stale = new ApiClient(baseUrl);
    const oldLogin = await stale.post('/api/auth/login', { email: account.email, password: account.password });
    assert.equal(oldLogin.status, 401);

    const fresh = new ApiClient(baseUrl);
    const newLogin = await fresh.post('/api/auth/login', { email: account.email, password: 'Brand-New-Password-456' });
    assert.equal(newLogin.status, 200);
    assert.equal(newLogin.body.user.email, account.email);
    account.password = 'Brand-New-Password-456';
  });

  test('changing a password signs out other devices but keeps the current one', async () => {
    const other = new ApiClient(baseUrl);
    const login = await other.post('/api/auth/login', { email: account.email, password: account.password });
    assert.equal(login.status, 200);

    const changed = await account.client.post('/api/account/password', {
      currentPassword: account.password,
      newPassword: 'Third-Password-789',
      confirmPassword: 'Third-Password-789',
    });
    assert.equal(changed.status, 200, JSON.stringify(changed.body));
    account.password = 'Third-Password-789';

    const otherMe = await other.get('/api/auth/me');
    assert.equal(otherMe.body.user, null, 'the other device was signed out');

    const me = await account.client.get('/api/auth/me');
    assert.equal(me.body.user.email, account.email, 'the device that changed it stays signed in');
  });

  test('password change requires a session', async () => {
    const res = await guest.post('/api/account/password', {
      currentPassword: 'anything',
      newPassword: 'Another-Password-123',
      confirmPassword: 'Another-Password-123',
    });
    assert.equal(res.status, 401);
  });

  test('a profile picture can be uploaded, replaced and removed', async () => {
    const upload = async (width, height) => {
      const form = new FormData();
      form.append('file', new Blob([createPng(width, height)], { type: 'image/png' }), 'me.png');
      return account.client.request('POST', '/api/account/avatar', { body: form });
    };

    const first = await upload(120, 120);
    assert.equal(first.status, 201, JSON.stringify(first.body));
    assert.match(first.body.avatar, /^\/api\/uploads\/avatar-\d{8}-[a-f0-9]+\.png$/);
    assert.equal(first.body.user.avatar, first.body.avatar);
    const firstUrl = first.body.avatar;
    account.avatar = firstUrl;

    const me = await account.client.get('/api/auth/me');
    assert.equal(me.body.user.avatar, firstUrl);

    const served = await guest.get(firstUrl, { raw: true });
    assert.equal(served.status, 200);
    assert.equal(served.headers.get('content-type'), 'image/png');

    const second = await upload(140, 140);
    assert.equal(second.status, 201);
    assert.notEqual(second.body.avatar, firstUrl);
    const replaced = await guest.get(firstUrl, { raw: true });
    assert.equal(replaced.status, 404, 'the replaced picture is removed from storage');

    const removed = await account.client.request('DELETE', '/api/account/avatar');
    assert.equal(removed.status, 200);
    assert.equal(removed.body.user.avatar, '');
    const goneUrl = await guest.get(second.body.avatar, { raw: true });
    assert.equal(goneUrl.status, 404);
  });

  test('profile picture uploads are validated', async () => {
    const notAnImage = new FormData();
    notAnImage.append('file', new Blob([Buffer.from('<?php echo "nope"; ?>')], { type: 'image/png' }), 'shell.png');
    const badType = await account.client.request('POST', '/api/account/avatar', { body: notAnImage });
    assert.equal(badType.status, 422);

    const tooBig = new FormData();
    tooBig.append('file', new Blob([Buffer.alloc(3 * 1024 * 1024)], { type: 'image/png' }), 'huge.png');
    const tooLarge = await account.client.request('POST', '/api/account/avatar', { body: tooBig });
    assert.equal(tooLarge.status, 422);
    assert.ok(tooLarge.body.fields.file);

    const anonymous = new FormData();
    anonymous.append('file', new Blob([createPng(80, 80)], { type: 'image/png' }), 'anon.png');
    const anon = await guest.request('POST', '/api/account/avatar', { body: anonymous });
    assert.equal(anon.status, 401);
  });

  test('a profile picture only ever changes the account that uploaded it', async () => {
    // Two fresh accounts, so the assertion does not depend on test order.
    const makeAccount = async (label) => {
      const client = new ApiClient(baseUrl);
      const email = uniqueEmail(`avatar-${label}`);
      const registered = await client.post('/api/auth/register', {
        email,
        password: 'Avatar-Password-123',
        name: `Avatar ${label}`,
        phone: '+233 24 555 0000',
        role: 'tenant',
      });
      assert.equal(registered.status, 201, JSON.stringify(registered.body));
      return client;
    };

    const first = await makeAccount('one');
    const second = await makeAccount('two');

    const form = new FormData();
    form.append('file', new Blob([createPng(100, 100)], { type: 'image/png' }), 'first.png');
    // No field in the request can name another account: the session decides.
    const uploaded = await first.request('POST', '/api/account/avatar', { body: form });
    assert.equal(uploaded.status, 201, JSON.stringify(uploaded.body));
    assert.match(uploaded.body.user.avatar, /^\/api\/uploads\/avatar-/);

    const untouched = await second.get('/api/auth/me');
    assert.equal(untouched.body.user.avatar, '', 'the other account is untouched');

    const cleared = await first.request('DELETE', '/api/account/avatar');
    assert.equal(cleared.status, 200);
    assert.equal(cleared.body.user.avatar, '');
  });
});
