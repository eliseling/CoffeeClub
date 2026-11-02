import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore } from './store.js';
import { DatabaseSync } from 'node:sqlite';

const coffee = { name: 'Test beans', method: 'Pour over', roast: 'Light', date: '2026-10-31' };
test('ten-point ratings accept endpoints, reject invalid scores, and persist all three criteria', () => {
  const store = createStore(':memory:');
  try {
    const entry = store.save('coffees', coffee);
    const rating = { coffeeId: entry.id, name: 'Alex', overall: 5, taste: 10, wouldDrinkAgain: 1, aroma: 5 };
    assert.equal(store.save('ratings', rating).taste, 10);
    for (const dimension of ['overall', 'taste', 'wouldDrinkAgain', 'aroma']) {
      for (const value of [0, 11, 5.5, '5', undefined]) assert.throws(() => store.save('ratings', { ...rating, [dimension]: value }), /between 1 and 10/);
    }
    assert.equal(store.all().ratings[0].wouldDrinkAgain, 1);
  } finally { store.close(); }
});
test('ten-point migration converts legacy ratings once and preserves names and notes', () => {
  const directory = mkdtempSync(join(tmpdir(), 'coffee-club-legacy-'));
  const path = join(directory, 'journal.sqlite');
  let store = createStore(path);
  const entry = store.save('coffees', coffee);
  store.close();
  const legacy = new DatabaseSync(path);
  legacy.prepare('DELETE FROM migrations WHERE id = ?').run('ratings-ten-point');
  const rating = { id: 'legacy', coffeeId: entry.id, name: 'Alex', notes: 'Original notes', overall: 4, flavor: 3, body: 2, aroma: 5 };
  legacy.prepare('INSERT INTO ratings (id, coffeeId, member, payload) VALUES (?, ?, ?, ?)').run(rating.id, entry.id, 'alex', JSON.stringify(rating));
  legacy.close();
  store = createStore(path);
  try {
    const saved = store.all().ratings[0];
    assert.equal(saved.overall, 8);
    assert.equal(saved.taste, 6);
    assert.equal(saved.aroma, 10);
    assert.equal(saved.wouldDrinkAgain, 5);
    assert.equal(saved.body, undefined);
    assert.equal(saved.flavor, undefined);
    assert.equal(saved.notes, rating.notes);
    store.close();
    store = createStore(path);
    assert.equal(store.all().ratings[0].overall, 8);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});
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
    assert.equal(store.all().coffees.length, 3);
    assert.equal(store.all().coffees.filter(entry => !entry.deletedAt).length, 2);
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
    store.save('ratings', { coffeeId: entry.id, name: 'Alex', overall: 8, aroma: 10, taste: 8, wouldDrinkAgain: 5 });
    store.close();
    store = createStore(path);
    assert.equal(store.all().coffees[0].name, coffee.name);
    assert.equal(store.all().recipes.length, 1);
    assert.equal(store.all().ratings[0].overall, 8);
    store.save('ratings', { coffeeId: entry.id, name: 'alex', overall: 10, aroma: 10, taste: 10, wouldDrinkAgain: 8 });
    assert.equal(store.all().ratings.length, 1);
    assert.equal(store.all().ratings[0].overall, 10);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});
test('deleting moves coffees and recipes to Recently deleted and restoring brings them back with ratings', () => {
  const store = createStore(':memory:');
  try {
    const entry = store.save('coffees', coffee);
    const recipe = store.save('recipes', { name: 'Morning cup', method: 'Pour over', ingredients: '18g coffee', steps: 'Brew.' });
    store.save('ratings', { coffeeId: entry.id, name: 'Alex', overall: 8, aroma: 7, taste: 8, wouldDrinkAgain: 9 });
    assert.equal(store.remove('coffees', entry.id), true);
    assert.equal(store.remove('coffees', entry.id), false);
    assert.equal(store.remove('recipes', recipe.id), true);
    assert.ok(store.all().coffees[0].deletedAt);
    assert.ok(store.all().recipes[0].deletedAt);
    assert.equal(store.all().ratings.length, 1);
    assert.equal(store.restore('coffees', entry.id), true);
    assert.equal(store.restore('coffees', entry.id), false);
    assert.equal(store.all().coffees[0].deletedAt, undefined);
    assert.equal(store.all().ratings[0].name, 'Alex');
    assert.equal(store.remove('coffees', 'missing'), false);
    assert.throws(() => store.remove('ratings', store.all().ratings[0].id), /Invalid entry type/);
  } finally { store.close(); }
});
test('coffees can wait in Want to make and older coffees count as made', () => {
  const directory = mkdtempSync(join(tmpdir(), 'coffee-club-made-'));
  const path = join(directory, 'journal.sqlite');
  let store = createStore(path);
  try {
    const planned = store.save('coffees', { ...coffee, date: '', made: false });
    assert.equal(store.save('coffees', coffee).made, true);
    assert.throws(() => store.save('coffees', { ...coffee, made: 'yes' }), /has been made/);
    const legacy = new DatabaseSync(path);
    legacy.prepare('INSERT INTO coffees (id, payload) VALUES (?, ?)').run('legacy', JSON.stringify({ id: 'legacy', name: 'Old beans', method: 'Pour over', roast: 'Light', date: '', tags: '', notes: '', roaster: '', origin: '' }));
    legacy.close();
    store.close();
    store = createStore(path);
    const coffees = store.all().coffees;
    assert.equal(coffees.find(entry => entry.id === planned.id).made, false);
    assert.equal(coffees.find(entry => entry.id === 'legacy').made, true);
    store.save('coffees', { ...planned, made: true, date: '2026-11-02' }, planned.id);
    assert.equal(store.all().coffees.find(entry => entry.id === planned.id).made, true);
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