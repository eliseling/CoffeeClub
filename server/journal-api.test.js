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
  const { api } = cloudStub({ coffees: [{ id: 'coffee', name: 'Korean coffee', date: null, made: false, updated_at: 'today' }], recipes: [], ratings: [{ id: 'rating', coffee_id: 'coffee', member: 'alex', name: 'Alex', overall: 8, taste: 9, would_drink_again: 10, aroma: 5, updated_at: 'today' }] });
  const journal = await api('journal');
  assert.equal(journal.coffees[0].date, '');
  assert.equal(journal.coffees[0].updatedAt, 'today');
  assert.equal(journal.coffees[0].made, false);
  assert.equal(journal.ratings[0].coffeeId, 'coffee');
  assert.equal(journal.ratings[0].member, undefined);
  assert.equal(journal.ratings[0].wouldDrinkAgain, 10);
  assert.equal(journal.ratings[0].taste, 9);
});
test('cloud writes keep rating uniqueness and support updates and optional dates', async () => {
  const { api, calls } = cloudStub({ coffees: [{ id: 'coffee', name: 'Korean coffee', date: null, made: true }], recipes: [{ id: 'recipe' }], ratings: [{ id: 'rating', coffee_id: 'coffee' }] });
  await api('ratings', { method: 'POST', body: JSON.stringify({ coffeeId: 'coffee', name: ' Alex ', overall: 8, aroma: 5, taste: 10, wouldDrinkAgain: 1, id: 'ignored' }) });
  const upsert = calls.find(call => call[0] === 'upsert');
  assert.equal(upsert[2].name, 'Alex');
  assert.equal(upsert[2].coffee_id, 'coffee');
  assert.equal(upsert[2].id, undefined);
  assert.equal(upsert[2].would_drink_again, 1);
  assert.equal(upsert[2].wouldDrinkAgain, undefined);
  assert.equal(upsert[2].taste, 10);
  assert.deepEqual(upsert[3], { onConflict: 'coffee_id,member' });
  await api('coffees/coffee', { method: 'PUT', body: JSON.stringify({ name: 'Korean coffee', method: 'Not recorded', roast: 'Not recorded', date: '' }) });
  assert.equal(calls.find(call => call[0] === 'update')[2].date, null);
  assert.equal(calls.find(call => call[0] === 'update')[2].made, true);
  await api('coffees', { method: 'POST', body: JSON.stringify({ name: 'Dalgona coffee', method: 'Not recorded', roast: 'Not recorded', made: false }) });
  assert.equal(calls.find(call => call[0] === 'insert')[2].made, false);
  await assert.rejects(api('other', { method: 'POST', body: '{}' }), /Invalid journal request/);
});
test('cloud deletion only marks entries as deleted and restore clears the mark', async () => {
  const { api, calls } = cloudStub({ coffees: [{ id: 'coffee', name: 'Korean coffee', made: true, deleted_at: '2026-11-02T08:00:00Z' }], recipes: [{ id: 'recipe' }], ratings: [] });
  assert.equal((await api('journal')).coffees[0].deletedAt, '2026-11-02T08:00:00Z');
  assert.deepEqual(await api('recipes/recipe', { method: 'DELETE' }), { success: true });
  assert.equal(calls.some(call => call[0] === 'delete'), false);
  assert.ok(calls.find(call => call[0] === 'update' && call[1] === 'recipes')[2].deleted_at);
  assert.deepEqual(calls.find(call => call[0] === 'is'), ['is', 'recipes', 'deleted_at', null]);
  assert.deepEqual(await api('coffees/coffee/restore', { method: 'POST' }), { success: true });
  assert.deepEqual(calls.filter(call => call[0] === 'update' && call[1] === 'coffees').at(-1)[2], { deleted_at: null });
  assert.deepEqual(calls.find(call => call[0] === 'not'), ['not', 'coffees', 'deleted_at', 'is', null]);
  await assert.rejects(api('ratings/rating', { method: 'DELETE' }), /Invalid journal request/);
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
test('cloud journal asks for the Want to make update when the database is missing it', async () => {
  const { api } = cloudStub({ coffees: [{ id: 'coffee', name: 'Korean coffee' }], recipes: [], ratings: [] });
  await assert.rejects(api('journal'), /004_want_to_make\.sql/);
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