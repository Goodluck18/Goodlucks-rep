/**
 * Genuinely concurrent financial writes (audit finding R4).
 *
 * The API's PHP server handles one request at a time, so parallel HTTP requests
 * cannot prove anything about two writers meeting in the database. Here two
 * separate OS processes run one financial operation each, started together
 * against the same SQLite file, and the test checks the database afterwards:
 *
 *   1. only one of them is allowed to win,
 *   2. the winner's records are written once,
 *   3. the loser writes nothing at all,
 *   4. the balances stay consistent.
 *
 * The operations go through the real engine functions (via
 * tests/finance-race.php), not through a copy of the logic. No API server is
 * involved, which keeps the race isolated from the HTTP test suite.
 */

import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { phpCommand } from '../scripts/php.mjs';

const projectRoot = path.resolve(import.meta.dirname, '..');
const workDir = path.join(projectRoot, '.data', 'concurrency-tests');
const dbPath = path.join(workDir, 'race.sqlite');
const tool = 'tests/sqlite-tool.php';
const harness = 'tests/finance-race.php';

const TODAY = new Date().toISOString().slice(0, 10);

/** Environment for a PHP process pointed at this suite's database. */
const env = () => ({
  ...process.env,
  DB_DRIVER: 'sqlite',
  DB_SQLITE_PATH: dbPath,
  APP_ENV: 'development',
});

/** Run one CLI script and return its raw result. */
function run(script, args = []) {
  const { cmd, baseArgs } = phpCommand();
  return new Promise((resolve) => {
    const child = spawn(cmd, [...baseArgs, path.join(projectRoot, script), ...args], {
      cwd: projectRoot,
      env: env(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    child.stdout.on('data', (chunk) => {
      out += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      err += String(chunk);
    });
    child.on('error', (error) => resolve({ code: -1, out: '', err: error.message }));
    child.on('close', (code) => resolve({ code, out, err }));
  });
}

/** Start two copies of the harness at the same moment. */
async function race(args) {
  const [first, second] = await Promise.all([run(harness, args), run(harness, args)]);
  const parse = (result) => {
    const line = result.out.trim().split('\n').filter(Boolean).pop() ?? '';
    try {
      return JSON.parse(line);
    } catch {
      return null;
    }
  };
  return { first, second, firstResult: parse(first), secondResult: parse(second) };
}

const won = (parsed) => Boolean(parsed && (parsed.ok === true || parsed.success === true));

const query = async (sql) => {
  const result = await run(tool, [`--path=${dbPath}`, '--mode=query', `--sql=${sql}`]);
  assert.equal(result.code, 0, result.out + result.err);
  const parsed = JSON.parse(result.out.trim());
  assert.equal(parsed.ok, true, JSON.stringify(parsed));
  return parsed.rows;
};

const value = async (sql, column = 'c') => {
  const rows = await query(sql);
  return Number(rows[0][column]);
};

/**
 * Run a write and assert the database accepted it.
 *
 * The exit code is not trusted here: the PHP-WASM fallback swallows it, so a
 * failed statement would look successful. The statement's own JSON result is
 * the check.
 */
const exec = async (sql) => {
  const result = await run(tool, [`--path=${dbPath}`, '--mode=exec', `--sql=${sql}`]);
  const parsed = JSON.parse(result.out.trim());
  assert.equal(parsed.ok, true, `statement failed: ${parsed.error ?? result.err}`);
};

let seq = 0;
const nextId = (prefix) => `${prefix}-${process.pid}-${++seq}`;

/** A fee obligation of `share` cedis owed to Goodlucks by one agent. */
const seedObligation = async (share) => {
  const id = nextId('vfr');
  await exec(
    `INSERT INTO viewing_fee_records (id, reference, agent_user_id, fee_total_ghs, collection_state, share_basis, goodlucks_share_ghs, recorded_at) ` +
      `VALUES ('${id}', 'VFR-RACE-${id}', 'agent-race', ${share}, 'collected', 'manual_agreement', ${share}, '${TODAY} 09:00:00')`
  );
  return id;
};

/** A pending claim from that agent. Nothing is confirmed yet. */
const seedSubmission = async (amount) => {
  const id = nextId('rms');
  await exec(
    `INSERT INTO remittance_submissions (id, reference, agent_user_id, amount_ghs, method, paid_at, status, created_at) ` +
      `VALUES ('${id}', 'RMS-RACE-${id}', 'agent-race', ${amount}, 'momo', '${TODAY}', 'submitted', '${TODAY} 09:05:00')`
  );
  return id;
};

const confirmArgs = (submissionId, recordId, amount) => [
  '--kind=confirm',
  `--submission=${submissionId}`,
  `--allocations=${JSON.stringify([{ viewingFeeRecordId: recordId, amountGhs: amount }])}`,
  '--actor=race-admin',
];

describe('Two processes writing the same database at once (R4)', () => {
  before(async () => {
    fs.mkdirSync(workDir, { recursive: true });
    for (const suffix of ['', '-wal', '-shm']) {
      fs.rmSync(dbPath + suffix, { force: true });
    }
    // The migration creates the complete schema for the empty file.
    const prepared = await run('php-backend/migrate.php', ['--apply']);
    assert.equal(prepared.code, 0, prepared.out + prepared.err);
  });

  after(() => {
    for (const suffix of ['', '-wal', '-shm']) {
      fs.rmSync(dbPath + suffix, { force: true });
    }
  });

  test('one confirmation wins and the money is recorded once', async () => {
    const recordId = await seedObligation(50);
    const submissionId = await seedSubmission(50);

    const { first, second, firstResult, secondResult } = await race(confirmArgs(submissionId, recordId, 50));
    assert.ok(firstResult && secondResult, `harness output: ${first.out}${first.err} | ${second.out}${second.err}`);
    assert.equal([firstResult, secondResult].filter(won).length, 1, `exactly one winner: ${first.out} | ${second.out}`);

    const loser = won(firstResult) ? secondResult : firstResult;
    assert.match(
      JSON.stringify(loser),
      /already (confirmed|rejected|disputed|submitted)|already decided|another request|exceeds/i,
      'the loser is refused with a clear reason, not a crash'
    );

    assert.equal(
      await value(`SELECT COUNT(*) AS c FROM remittance_allocations WHERE submission_id = '${submissionId}'`),
      1,
      'one allocation'
    );
    assert.equal(await value(`SELECT COUNT(*) AS c FROM fee_remittances WHERE viewing_fee_record_id = '${recordId}'`), 1, 'one receipt');
    assert.equal(
      await value(`SELECT COALESCE(SUM(amount_ghs), 0) AS c FROM fee_remittances WHERE viewing_fee_record_id = '${recordId}'`),
      50,
      'the obligation received the money once'
    );
    assert.equal(await value(`SELECT COUNT(*) AS c FROM remittance_submissions WHERE id = '${submissionId}' AND status = 'confirmed'`), 1);
  });

  test('two confirmations cannot both spend the same outstanding balance', async () => {
    const recordId = await seedObligation(40);
    const firstSubmission = await seedSubmission(40);
    const secondSubmission = await seedSubmission(40);

    const results = await Promise.all([
      run(harness, confirmArgs(firstSubmission, recordId, 40)),
      run(harness, confirmArgs(secondSubmission, recordId, 40)),
    ]);
    const parsed = results.map((result) => {
      try {
        return JSON.parse(result.out.trim().split('\n').filter(Boolean).pop());
      } catch {
        return null;
      }
    });

    assert.ok(parsed[0] && parsed[1], `harness output: ${JSON.stringify(results.map((r) => r.out))}`);
    assert.equal(parsed.filter(won).length, 1, 'only one confirmation may take the balance');

    const total = await value(`SELECT COALESCE(SUM(amount_ghs), 0) AS c FROM fee_remittances WHERE viewing_fee_record_id = '${recordId}'`);
    assert.equal(total, 40, 'never more than the obligation');
    assert.equal(
      await value(`SELECT COUNT(*) AS c FROM remittance_allocations WHERE viewing_fee_record_id = '${recordId}'`),
      1,
      'the losing confirmation wrote no allocation'
    );
  });

  test('one reversal wins and the receipt is not over-reversed', async () => {
    const recordId = await seedObligation(30);
    const submissionId = await seedSubmission(30);
    const confirmed = await run(harness, confirmArgs(submissionId, recordId, 30));
    assert.ok(won(JSON.parse(confirmed.out.trim().split('\n').filter(Boolean).pop())), confirmed.out + confirmed.err);

    const receiptId = (await query(`SELECT id FROM fee_remittances WHERE viewing_fee_record_id = '${recordId}' AND entry_type = 'receipt'`))[0].id;

    const { first, second, firstResult, secondResult } = await race([
      '--kind=reverse',
      `--receipt=${receiptId}`,
      '--amount=30',
      '--reason=Race harness reversal',
      '--actor=race-admin',
    ]);
    assert.ok(firstResult && secondResult, `harness output: ${first.out}${first.err} | ${second.out}${second.err}`);
    assert.equal([firstResult, secondResult].filter(won).length, 1, `exactly one reversal: ${first.out} | ${second.out}`);

    const reversals = await value(`SELECT COUNT(*) AS c FROM fee_remittances WHERE reversal_of_receipt_id = '${receiptId}'`);
    assert.equal(reversals, 1, 'one reversal row');
    assert.equal(
      await value(`SELECT COALESCE(SUM(amount_ghs), 0) AS c FROM fee_remittances WHERE viewing_fee_record_id = '${recordId}'`),
      0,
      'the receipt and its reversal net to zero'
    );
    assert.equal(
      await value(`SELECT COUNT(*) AS c FROM financial_adjustments WHERE subject_id = '${receiptId}'`),
      1,
      'one adjustment'
    );
  });

  test('one commission payment wins and the commission is not over-received', async () => {
    const commissionId = nextId('rcm');
    await exec(
      `INSERT INTO rental_commissions (id, reference, property_id, agent_user_id, commission_amount_ghs, status, basis, rental_reference, due_date, created_at) ` +
        `VALUES ('${commissionId}', 'RCM-RACE-${commissionId}', 'prop-race', 'agent-race', 100, 'agreed', 'manual_agreement', 'TENANCY-RACE-1', '${TODAY}', '${TODAY} 08:00:00')`
    );

    const payArgs = ['--kind=payment', `--commission=${commissionId}`, '--amount=60', '--actor=race-admin'];
    const { first, second, firstResult, secondResult } = await race(payArgs);
    assert.ok(firstResult && secondResult, `harness output: ${first.out}${first.err} | ${second.out}${second.err}`);
    assert.equal([firstResult, secondResult].filter(won).length, 1, `exactly one payment: ${first.out} | ${second.out}`);

    assert.equal(
      await value(`SELECT COALESCE(SUM(amount_ghs), 0) AS c FROM commission_payments WHERE commission_id = '${commissionId}'`),
      60,
      'received once'
    );
    assert.equal(
      await value(`SELECT COUNT(*) AS c FROM commission_payments WHERE commission_id = '${commissionId}'`),
      1,
      'one payment row'
    );
  });

  test('one remittance decision wins and the other writer is told to reload', async () => {
    const submissionId = await seedSubmission(10);

    const { first, second, firstResult, secondResult } = await race([
      '--kind=decision',
      `--submission=${submissionId}`,
      '--status=rejected',
      '--reason=No matching entry on the collections account.',
      '--actor=race-admin',
    ]);
    assert.ok(firstResult && secondResult, `harness output: ${first.out}${first.err} | ${second.out}${second.err}`);
    assert.equal([firstResult, secondResult].filter(won).length, 1, `exactly one decision: ${first.out} | ${second.out}`);

    assert.equal(
      await value(`SELECT COUNT(*) AS c FROM remittance_submissions WHERE id = '${submissionId}' AND status = 'rejected'`),
      1
    );
    assert.equal(await value(`SELECT COUNT(*) AS c FROM fee_remittances WHERE submission_id = '${submissionId}'`), 0, 'a rejection records no money');
  });

  test('every race leaves the five figures consistent', async () => {
    // confirmedReceived = applied to obligations (there is no unallocated money
    // in this suite: every confirmation allocated what it confirmed).
    const applied = await value(
      `SELECT COALESCE(SUM(a.amount_ghs), 0) AS c
         FROM remittance_allocations a
         JOIN remittance_submissions s ON s.id = a.submission_id
        WHERE s.status = 'confirmed'`
    );
    const received = await value(
      `SELECT COALESCE(SUM(amount_ghs), 0) AS c FROM fee_remittances WHERE submission_id IS NOT NULL`
    );
    const reversed = await value(
      `SELECT COALESCE(-SUM(amount_ghs), 0) AS c FROM fee_remittances WHERE entry_type = 'reversal'`
    );

    assert.equal(received, applied, 'confirmed = applied + unallocated (no unallocated rows here)');
    assert.ok(reversed <= received, 'reversals never exceed what was received');
    assert.equal(await value(`SELECT COUNT(*) AS c FROM remittance_allocations WHERE amount_ghs <= 0`), 0);
    assert.equal(await value(`SELECT COUNT(*) AS c FROM fee_remittances WHERE entry_type = 'reversal' AND reversal_of_receipt_id IS NULL`), 0, 'every reversal names its receipt');
  });
});
