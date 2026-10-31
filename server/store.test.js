import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore } from './store.js';

const coffee = { name: 'Test beans', method: 'Pour over', roast: 'Light', date: '2026-10-31' };
test('initial club coffees are seeded once without inventing tasting details or restoring deletions', () => {
  const directory = mkdtempSync(join(tmpdir(), 'coffee-club-seed-'));
  const path = join(directory, 'journal.sqlite');
  let store = createStore(path, { seed: true });
  try {
    assert.deepEqual(store.all().coffees.map(entry => entry.name), ['Korean coffee', 'Brazilian coffee', 'Iced Biscoff spread coffee']);
    assert.equal(store.all().ratings.length, 0);
    assert.equal(store.all().coffees[0].date, '');
    assert.equal(store.all().coffees[0].method, 'Not recorded');
    store.remove('coffees', 'club-korean-coffee');
    store.close();
    store = createStore(path, { seed: true });
    assert.equal(store.all().coffees.length, 2);
    const saved = store.save('coffees', { ...store.all().coffees[0], notes: 'Our first tasting.' }, 'club-brazilian-coffee');
    assert.equal(saved.date, '');
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});
test('tastings, recipes, and ratings survive reopening the database', () => {
  const directory = mkdtempSync(join(tmpdir(), 'coffee-club-'));
  const path = join(directory, 'journal.sqlite');
  let store = createStore(path);
  try {
    const entry = store.save('coffees', coffee);
    store.save('recipes', { name: 'Morning cup', method: 'Pour over', ingredients: '18g coffee, 300g water', steps: 'Bloom, then pour.' });
    store.save('ratings', { coffeeId: entry.id, name: 'Alex', overall: 4, aroma: 5, flavor: 4, body: 3 });
    store.close();
    store = createStore(path);
    assert.equal(store.all().coffees[0].name, coffee.name);
    assert.equal(store.all().recipes.length, 1);
    assert.equal(store.all().ratings[0].overall, 4);
    store.save('ratings', { coffeeId: entry.id, name: 'alex', overall: 5, aroma: 5, flavor: 5, body: 4 });
    assert.equal(store.all().ratings.length, 1);
    assert.equal(store.all().ratings[0].overall, 5);
    store.remove('coffees', entry.id);
    assert.equal(store.all().ratings.length, 0);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});
test('rejects malformed entries without modifying the journal', () => {
  const store = createStore(':memory:');
  try {
    assert.throws(() => store.save('coffees', { ...coffee, name: '' }));
    assert.throws(() => store.save('coffees', { ...coffee, date: '2026-02-30' }));
    assert.throws(() => store.save('ratings', { coffeeId: 'missing', name: 'Alex', overall: 6 }));
    assert.throws(() => store.save('arbitrary', coffee));
    assert.deepEqual(store.all(), { coffees: [], recipes: [], ratings: [] });
  } finally { store.close(); }
});