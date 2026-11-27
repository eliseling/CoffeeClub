import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { createJournalApi } from '../src/journal-api.js';

test('Supabase migration supports shared writes, rating uniqueness, validation, and one-time seeds', async () => {
  const db = new PGlite();
  const migration = readFileSync(new URL('../supabase/migrations/001_shared_journal.sql', import.meta.url), 'utf8');
  try {
    await db.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
    await db.exec(migration);
    await db.exec('SET ROLE anon;');
    assert.equal((await db.query('SELECT * FROM public.coffees')).rows.length, 3);
    const coffee = (await db.query("SELECT * FROM public.coffees WHERE id = 'club-korean-coffee'")).rows[0];
    assert.equal(coffee.date, null);
    assert.equal(coffee.method, 'Not recorded');
    await db.query('INSERT INTO public.ratings (coffee_id, name, overall, aroma, flavor, body) VALUES ($1, $2, 4, 3, 4, 3)', [coffee.id, 'Alex']);
    const originalId = (await db.query('SELECT id FROM public.ratings')).rows[0].id;
    await db.query('INSERT INTO public.ratings (coffee_id, name, overall, aroma, flavor, body) VALUES ($1, $2, 5, 4, 5, 4) ON CONFLICT (coffee_id, member) DO UPDATE SET name = excluded.name, overall = excluded.overall, aroma = excluded.aroma, flavor = excluded.flavor, body = excluded.body', [coffee.id, ' alex ']);
    const ratings = (await db.query('SELECT * FROM public.ratings')).rows;
    assert.equal(ratings.length, 1);
    assert.equal(ratings[0].id, originalId);
    assert.equal(ratings[0].overall, 5);
    await assert.rejects(db.query("UPDATE public.ratings SET overall = 6 WHERE coffee_id = 'club-korean-coffee'"));
    await assert.rejects(db.query("INSERT INTO public.coffees (name) VALUES ('   ')"));
    await db.query('INSERT INTO public.recipes (name, ingredients, steps) VALUES ($1, $2, $3)', ['Club recipe', 'Coffee, water', 'Brew and enjoy']);
    await db.query("UPDATE public.recipes SET notes = 'Saved tip' WHERE name = 'Club recipe'");
    assert.equal((await db.query('SELECT notes FROM public.recipes')).rows[0].notes, 'Saved tip');
    await db.query("DELETE FROM public.coffees WHERE id = 'club-korean-coffee'");
    assert.equal((await db.query('SELECT * FROM public.ratings')).rows.length, 0);
    await assert.rejects(db.query('SELECT * FROM public.coffee_club_migrations'));
    await db.exec('RESET ROLE;');
    await db.exec(migration);
    assert.equal((await db.query('SELECT * FROM public.coffees')).rows.length, 2);
  } finally { await db.close(); }
});

test('ten-point Supabase migration preserves old ratings and enforces new criteria for shared visitors', async () => {
  const db = new PGlite();
  const initial = readFileSync(new URL('../supabase/migrations/001_shared_journal.sql', import.meta.url), 'utf8');
  const upgrade = readFileSync(new URL('../supabase/migrations/002_ten_point_ratings.sql', import.meta.url), 'utf8');
  try {
    await db.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
    await db.exec(initial);
    await db.query("INSERT INTO public.ratings (coffee_id, name, overall, aroma, flavor, body, notes) VALUES ('club-korean-coffee', 'Alex', 4, 5, 3, 2, 'Original notes')");
    await db.exec(upgrade);
    await db.exec(upgrade);
    await db.exec('SET ROLE anon;');
    const saved = (await db.query('SELECT * FROM public.ratings')).rows[0];
    assert.equal(saved.overall, 8);
    assert.equal(saved.aroma, 10);
    assert.equal(saved.taste, 6);
    assert.equal(saved.would_drink_again, 5);
    assert.equal(saved.body, undefined);
    assert.equal(saved.notes, 'Original notes');
    await db.query("INSERT INTO public.ratings (coffee_id, name, overall, taste, would_drink_again, aroma) VALUES ('club-korean-coffee', ' alex ', 10, 1, 10, 5) ON CONFLICT (coffee_id, member) DO UPDATE SET overall = excluded.overall, taste = excluded.taste, would_drink_again = excluded.would_drink_again, aroma = excluded.aroma");
    assert.equal((await db.query('SELECT * FROM public.ratings')).rows.length, 1);
    for (const column of ['overall', 'taste', 'would_drink_again', 'aroma']) {
      for (const value of [0, 11]) await assert.rejects(db.query(`UPDATE public.ratings SET ${column} = ${value}`));
    }
    await db.query("INSERT INTO public.ratings (coffee_id, name) VALUES ('club-brazilian-coffee', 'Sam')");
    const neutral = (await db.query("SELECT * FROM public.ratings WHERE name = 'Sam'")).rows[0];
    assert.equal(neutral.overall, 5);
    assert.equal(neutral.taste, 5);
    assert.equal(neutral.would_drink_again, 5);
    assert.equal(neutral.aroma, 5);
  } finally { await db.close(); }
});

function cloudStub(rows) {
  const calls = [];
  const client = {
    from(kind) {
      const query = {
        select(value) { calls.push(['select', kind, value]); return query; },
        single() { return Promise.resolve({ data: rows[kind][0], error: null }); },
        insert(row) { calls.push(['insert', kind, row]); return query; },
        update(row) { calls.push(['update', kind, row]); return query; },
        upsert(row, options) { calls.push(['upsert', kind, row, options]); return query; },
        delete() { calls.push(['delete', kind]); return query; },
        eq(field, value) { calls.push(['eq', kind, field, value]); return query; },
        is(field, value) { calls.push(['is', kind, field, value]); return query; },
        not(field, operator, value) { calls.push(['not', kind, field, operator, value]); return query; },
        then(resolve, reject) { return Promise.resolve({ data: rows[kind], error: null }).then(resolve, reject); },
      };
      return query;
    },
  };
  return { calls, api: createJournalApi({ url: 'https://test.supabase.co', key: 'sb_publishable_test', clientFactory: () => client }) };
}

test('cloud journal maps persisted database rows into the existing UI contract', async () => {
  const { api } = cloudStub({ coffees: [{ id: 'coffee', name: 'Korean coffee', date: null, made: false, updated_at: 'today' }], recipes: [], ratings: [{ id: 'rating', coffee_id: 'coffee', member: 'alex', name: 'Alex', overall: 8, taste: 9, would_drink_again: 10, aroma: 5, deleted_at: '2026-11-27T08:00:00Z', updated_at: 'today' }] });
  const journal = await api('journal');
  assert.equal(journal.coffees[0].date, '');
  assert.equal(journal.coffees[0].updatedAt, 'today');
  assert.equal(journal.coffees[0].made, false);
  assert.equal(journal.ratings[0].coffeeId, 'coffee');
  assert.equal(journal.ratings[0].member, undefined);
  assert.equal(journal.ratings[0].wouldDrinkAgain, 10);
  assert.equal(journal.ratings[0].taste, 9);
  assert.equal(journal.ratings[0].deletedAt, '2026-11-27T08:00:00Z');
});
test('cloud writes keep rating uniqueness and support updates and optional dates', async () => {
  const { api, calls } = cloudStub({ coffees: [{ id: 'coffee', name: 'Korean coffee', date: null, made: true }], recipes: [{ id: 'recipe' }], ratings: [{ id: 'rating', coffee_id: 'coffee', deleted_at: null }] });
  await api('ratings', { method: 'POST', body: JSON.stringify({ coffeeId: 'coffee', name: ' Alex ', overall: 8, aroma: 5, taste: 10, wouldDrinkAgain: 1, id: 'ignored' }) });
  const upsert = calls.find(call => call[0] === 'upsert');
  assert.equal(upsert[2].name, 'Alex');
  assert.equal(upsert[2].coffee_id, 'coffee');
  assert.equal(upsert[2].id, undefined);
  assert.equal(upsert[2].would_drink_again, 1);
  assert.equal(upsert[2].wouldDrinkAgain, undefined);
  assert.equal(upsert[2].taste, 10);
  assert.equal(upsert[2].deleted_at, null);
  assert.deepEqual(upsert[3], { onConflict: 'coffee_id,member' });
  await api('coffees/coffee', { method: 'PUT', body: JSON.stringify({ name: 'Korean coffee', method: 'Not recorded', roast: 'Not recorded', date: '' }) });
  assert.equal(calls.find(call => call[0] === 'update')[2].date, null);
  assert.equal(calls.find(call => call[0] === 'update')[2].made, true);
  await api('coffees', { method: 'POST', body: JSON.stringify({ name: 'Dalgona coffee', method: 'Not recorded', roast: 'Not recorded', made: false }) });
  assert.equal(calls.find(call => call[0] === 'insert')[2].made, false);
  await assert.rejects(api('other', { method: 'POST', body: '{}' }), /Invalid journal request/);
});
test('cloud deletion only marks entries as deleted and restore clears the mark', async () => {
  const { api, calls } = cloudStub({ coffees: [{ id: 'coffee', name: 'Korean coffee', made: true, deleted_at: '2026-11-02T08:00:00Z' }], recipes: [{ id: 'recipe' }], ratings: [{ id: 'rating', coffee_id: 'coffee', deleted_at: null }] });
  assert.equal((await api('journal')).coffees[0].deletedAt, '2026-11-02T08:00:00Z');
  assert.deepEqual(await api('recipes/recipe', { method: 'DELETE' }), { success: true });
  assert.equal(calls.some(call => call[0] === 'delete'), false);
  assert.ok(calls.find(call => call[0] === 'update' && call[1] === 'recipes')[2].deleted_at);
  assert.deepEqual(calls.find(call => call[0] === 'is'), ['is', 'recipes', 'deleted_at', null]);
  assert.deepEqual(await api('coffees/coffee/restore', { method: 'POST' }), { success: true });
  assert.deepEqual(calls.filter(call => call[0] === 'update' && call[1] === 'coffees').at(-1)[2], { deleted_at: null });
  assert.deepEqual(calls.find(call => call[0] === 'not'), ['not', 'coffees', 'deleted_at', 'is', null]);
  assert.deepEqual(await api('ratings/rating', { method: 'DELETE' }), { success: true });
  assert.ok(calls.find(call => call[0] === 'update' && call[1] === 'ratings')[2].deleted_at);
  assert.deepEqual(await api('ratings/rating/restore', { method: 'POST' }), { success: true });
  assert.deepEqual(calls.filter(call => call[0] === 'update' && call[1] === 'ratings').at(-1)[2], { deleted_at: null });
  await assert.rejects(api('ratings/rating', { method: 'PUT', body: '{}' }), /Invalid journal request/);
  await assert.rejects(api('coffees/coffee/other', { method: 'POST' }), /Invalid journal request/);
});
test('Recently deleted migration stops shared visitors from erasing entries but allows soft delete and restore', async () => {
  const db = new PGlite();
  const migrations = ['001_shared_journal.sql', '002_ten_point_ratings.sql', '003_recently_deleted.sql'].map(name => readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8'));
  try {
    await db.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
    for (const migration of migrations) await db.exec(migration);
    await db.exec(migrations[2]);
    await db.query("INSERT INTO public.ratings (coffee_id, name) VALUES ('club-korean-coffee', 'Alex')");
    await db.exec('SET ROLE anon;');
    await assert.rejects(db.query("DELETE FROM public.coffees WHERE id = 'club-korean-coffee'"), /permission denied/);
    await assert.rejects(db.query('DELETE FROM public.ratings'), /permission denied/);
    await assert.rejects(db.query('DELETE FROM public.recipes'), /permission denied/);
    await db.query("UPDATE public.coffees SET deleted_at = now() WHERE id = 'club-korean-coffee'");
    assert.ok((await db.query("SELECT deleted_at FROM public.coffees WHERE id = 'club-korean-coffee'")).rows[0].deleted_at);
    assert.equal((await db.query('SELECT * FROM public.ratings')).rows.length, 1);
    await db.query("UPDATE public.coffees SET deleted_at = null WHERE id = 'club-korean-coffee'");
    assert.equal((await db.query('SELECT * FROM public.coffees WHERE deleted_at IS NULL')).rows.length, 3);
  } finally { await db.close(); }
});
test('Want to make migration keeps existing coffees made and lets shared visitors plan and make coffees', async () => {
  const db = new PGlite();
  const migrations = ['001_shared_journal.sql', '002_ten_point_ratings.sql', '003_recently_deleted.sql', '004_want_to_make.sql'].map(name => readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8'));
  try {
    await db.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
    for (const migration of migrations) await db.exec(migration);
    await db.exec(migrations[3]);
    await db.exec('SET ROLE anon;');
    assert.deepEqual((await db.query('SELECT DISTINCT made FROM public.coffees')).rows, [{ made: true }]);
    await db.query("INSERT INTO public.coffees (id, name, made) VALUES ('dalgona', 'Dalgona coffee', false)");
    assert.equal((await db.query("SELECT made FROM public.coffees WHERE id = 'dalgona'")).rows[0].made, false);
    await db.query("UPDATE public.coffees SET made = true, date = '2026-11-02' WHERE id = 'dalgona'");
    assert.equal((await db.query("SELECT made FROM public.coffees WHERE id = 'dalgona'")).rows[0].made, true);
    await assert.rejects(db.query("UPDATE public.coffees SET made = null WHERE id = 'dalgona'"));
  } finally { await db.close(); }
});
test('erase migration removes entries deleted over 30 days ago with their ratings, and visitors cannot run it', async () => {
  const db = new PGlite();
  const names = ['001_shared_journal.sql', '002_ten_point_ratings.sql', '003_recently_deleted.sql', '004_want_to_make.sql', '005_erase_after_30_days.sql'];
  const migrations = names.map(name => readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8'));
  // Embedded Postgres has no pg_cron, so run the erase part of 005 and leave out the hourly schedule.
  const erase = `${migrations[4].split('create extension if not exists pg_cron')[0]}commit;`;
  assert.match(migrations[4], /cron\.schedule\('coffee-club-erase-expired', '0 \* \* \* \*'/);
  try {
    await db.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
    for (const migration of migrations.slice(0, 4)) await db.exec(migration);
    await db.query("INSERT INTO public.ratings (coffee_id, name) VALUES ('club-korean-coffee', 'Alex'), ('club-brazilian-coffee', 'Alex')");
    await db.query("UPDATE public.coffees SET deleted_at = now() - interval '31 days' WHERE id = 'club-korean-coffee'");
    await db.query("UPDATE public.coffees SET deleted_at = now() - interval '29 days' WHERE id = 'club-brazilian-coffee'");
    await db.query("INSERT INTO public.recipes (name, ingredients, steps, deleted_at) VALUES ('Old recipe', 'Coffee', 'Brew', now() - interval '40 days'), ('Kept recipe', 'Coffee', 'Brew', null)");
    await db.exec(erase);
    assert.deepEqual((await db.query('SELECT id FROM public.coffees ORDER BY id')).rows.map(row => row.id), ['club-brazilian-coffee', 'club-iced-biscoff-coffee']);
    assert.deepEqual((await db.query('SELECT coffee_id FROM public.ratings')).rows, [{ coffee_id: 'club-brazilian-coffee' }]);
    assert.deepEqual((await db.query('SELECT name FROM public.recipes')).rows, [{ name: 'Kept recipe' }]);
    await db.query("UPDATE public.coffees SET deleted_at = now() - interval '30 days 1 minute' WHERE id = 'club-brazilian-coffee'");
    await db.exec('SET ROLE anon;');
    await assert.rejects(db.query('SELECT public.coffee_club_erase_expired()'), /permission denied/);
    await db.exec('RESET ROLE;');
    await db.query('SELECT public.coffee_club_erase_expired()');
    assert.deepEqual((await db.query('SELECT id FROM public.coffees')).rows, [{ id: 'club-iced-biscoff-coffee' }]);
    assert.equal((await db.query('SELECT * FROM public.ratings')).rows.length, 0);
  } finally { await db.close(); }
});
test('cloud journal asks for the Want to make update when the database is missing it', async () => {
  const { api } = cloudStub({ coffees: [{ id: 'coffee', name: 'Korean coffee' }], recipes: [], ratings: [] });
  await assert.rejects(api('journal'), /004_want_to_make\.sql/);
});
test('cloud journal asks for the rating deletion update when the database is missing it', async () => {
  const { api } = cloudStub({ coffees: [], recipes: [], ratings: [{ id: 'rating', coffee_id: 'coffee', name: 'Alex', overall: 5, taste: 5, would_drink_again: 5, aroma: 5 }] });
  await assert.rejects(api('journal'), /006_delete_ratings\.sql/);
});
test('rating deletion migration lets visitors delete and restore ratings, and erases them after 30 days', async () => {
  const db = new PGlite();
  const names = ['001_shared_journal.sql', '002_ten_point_ratings.sql', '003_recently_deleted.sql', '004_want_to_make.sql', '005_erase_after_30_days.sql', '006_delete_ratings.sql'];
  const migrations = names.map(name => readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8'));
  // Embedded Postgres has no pg_cron, so leave out 005's hourly schedule.
  migrations[4] = `${migrations[4].split('create extension if not exists pg_cron')[0]}commit;`;
  try {
    await db.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
    for (const migration of migrations) await db.exec(migration);
    await db.exec(migrations[5]);
    await db.exec('SET ROLE anon;');
    await db.query("INSERT INTO public.ratings (coffee_id, name) VALUES ('club-korean-coffee', 'Alex'), ('club-korean-coffee', 'Sam'), ('club-brazilian-coffee', 'Alex')");
    await assert.rejects(db.query("DELETE FROM public.ratings WHERE name = 'Sam'"), /permission denied/);
    await db.query("UPDATE public.ratings SET deleted_at = now() WHERE name = 'Sam'");
    await db.query("UPDATE public.ratings SET deleted_at = null WHERE name = 'Sam'");
    await db.query("UPDATE public.ratings SET deleted_at = now() - interval '31 days' WHERE coffee_id = 'club-korean-coffee' AND name = 'Alex'");
    await db.query("UPDATE public.ratings SET deleted_at = now() - interval '29 days' WHERE coffee_id = 'club-brazilian-coffee'");
    await db.query("INSERT INTO public.ratings (coffee_id, name, overall, deleted_at) VALUES ('club-brazilian-coffee', ' alex ', 9, null) ON CONFLICT (coffee_id, member) DO UPDATE SET overall = excluded.overall, deleted_at = excluded.deleted_at");
    assert.deepEqual((await db.query("SELECT overall, deleted_at FROM public.ratings WHERE coffee_id = 'club-brazilian-coffee'")).rows, [{ overall: 9, deleted_at: null }]);
    await assert.rejects(db.query('SELECT public.coffee_club_erase_expired()'), /permission denied/);
    await db.exec('RESET ROLE;');
    await db.query('SELECT public.coffee_club_erase_expired()');
    assert.deepEqual((await db.query('SELECT coffee_id, name FROM public.ratings ORDER BY coffee_id, name')).rows, [{ coffee_id: 'club-brazilian-coffee', name: 'Alex' }, { coffee_id: 'club-korean-coffee', name: 'Sam' }]);
  } finally { await db.close(); }
});
test('localhost still uses its server and misconfigured static hosting reports a useful error', async () => {
  let requested;
  const api = createJournalApi({ fetcher: async (url, options) => { requested = { url, options }; return { ok: true, json: async () => ({ coffees: [], recipes: [], ratings: [] }) }; } });
  await api('journal');
  assert.equal(requested.url, '/api/journal');
  await assert.rejects(createJournalApi({ allowLocal: false })('journal'), /GitHub Pages/);
  await assert.rejects(createJournalApi({ url: 'https://test.supabase.co' })('journal'), /both/);
  await assert.rejects(createJournalApi({ url: 'https://test.supabase.co', key: 'sb_secret_bad' })('journal'), /never a secret/);
});