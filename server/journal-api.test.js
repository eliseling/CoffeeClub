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
        then(resolve, reject) { return Promise.resolve({ data: rows[kind], error: null }).then(resolve, reject); },
      };
      return query;
    },
  };
  return { calls, api: createJournalApi({ url: 'https://test.supabase.co', key: 'sb_publishable_test', clientFactory: () => client }) };
}

test('cloud journal maps persisted database rows into the existing UI contract', async () => {
  const { api } = cloudStub({ coffees: [{ id: 'coffee', name: 'Korean coffee', date: null, updated_at: 'today' }], recipes: [], ratings: [{ id: 'rating', coffee_id: 'coffee', member: 'alex', name: 'Alex', overall: 4, updated_at: 'today' }] });
  const journal = await api('journal');
  assert.equal(journal.coffees[0].date, '');
  assert.equal(journal.coffees[0].updatedAt, 'today');
  assert.equal(journal.ratings[0].coffeeId, 'coffee');
  assert.equal(journal.ratings[0].member, undefined);
});
test('cloud writes keep rating uniqueness and support updates, optional dates, and deletion', async () => {
  const { api, calls } = cloudStub({ coffees: [{ id: 'coffee', name: 'Korean coffee', date: null }], recipes: [{ id: 'recipe' }], ratings: [{ id: 'rating', coffee_id: 'coffee' }] });
  await api('ratings', { method: 'POST', body: JSON.stringify({ coffeeId: 'coffee', name: ' Alex ', overall: 4, aroma: 3, flavor: 4, body: 3, id: 'ignored' }) });
  const upsert = calls.find(call => call[0] === 'upsert');
  assert.equal(upsert[2].name, 'Alex');
  assert.equal(upsert[2].coffee_id, 'coffee');
  assert.equal(upsert[2].id, undefined);
  assert.deepEqual(upsert[3], { onConflict: 'coffee_id,member' });
  await api('coffees/coffee', { method: 'PUT', body: JSON.stringify({ name: 'Korean coffee', method: 'Not recorded', roast: 'Not recorded', date: '' }) });
  assert.equal(calls.find(call => call[0] === 'update')[2].date, null);
  assert.deepEqual(await api('recipes/recipe', { method: 'DELETE' }), { success: true });
  await assert.rejects(api('other', { method: 'POST', body: '{}' }), /Invalid journal request/);
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