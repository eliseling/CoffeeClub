import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { methods, roasts, starterCoffees } from '../shared/journal.js';

export { methods, roasts } from '../shared/journal.js';

function text(value, label, required = false, max = 2000) {
  if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) {
    throw new Error(`Please enter a valid ${label}.`);
  }
  return value.trim();
}

export function validate(kind, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid entry.');
  if (kind === 'ratings') {
    const result = { coffeeId: text(input.coffeeId, 'coffee', true, 100), name: text(input.name, 'name', true, 80), notes: text(input.notes ?? '', 'notes') };
    for (const dimension of ['overall', 'taste', 'wouldDrinkAgain', 'aroma']) {
      if (!Number.isInteger(input[dimension]) || input[dimension] < 1 || input[dimension] > 10) throw new Error('Ratings must be between 1 and 10.');
      result[dimension] = input[dimension];
    }
    return result;
  }
  const result = {
    name: text(input.name, 'name', true, 100),
    method: text(input.method, 'brew method', true, 40),
    notes: text(input.notes ?? '', 'notes'),
  };
  if (!methods.includes(result.method)) throw new Error('Choose a brew method.');
  if (kind === 'coffees') {
    Object.assign(result, {
      roaster: text(input.roaster ?? '', 'roaster', false, 100),
      origin: text(input.origin ?? '', 'origin', false, 100),
      roast: text(input.roast, 'roast', true, 20),
      date: text(input.date ?? '', 'date', false, 10),
      tags: text(input.tags ?? '', 'tasting notes', false, 200),
    });
    if (!roasts.includes(result.roast)) throw new Error('Choose a roast level.');
    if (result.date && (!/^\d{4}-\d{2}-\d{2}$/.test(result.date) || Number.isNaN(Date.parse(result.date)) || new Date(result.date).toISOString().slice(0, 10) !== result.date)) throw new Error('Choose a valid tasting date.');
  } else if (kind === 'recipes') {
    Object.assign(result, { author: text(input.author ?? '', 'author', false, 80), ingredients: text(input.ingredients, 'ingredients', true), steps: text(input.steps, 'recipe steps', true), time: text(input.time ?? '', 'brew time', false, 40) });
  } else throw new Error('Invalid entry type.');
  return result;
}

export function createStore(filename, { seed = false } = {}) {
  if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  db.exec(`CREATE TABLE IF NOT EXISTS coffees (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS recipes (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS ratings (id TEXT PRIMARY KEY, coffeeId TEXT NOT NULL REFERENCES coffees(id) ON DELETE CASCADE, member TEXT NOT NULL, payload TEXT NOT NULL, UNIQUE(coffeeId, member));
    CREATE TABLE IF NOT EXISTS migrations (id TEXT PRIMARY KEY);`);
  if (!db.prepare('SELECT id FROM migrations WHERE id = ?').get('ratings-ten-point')) {
    db.exec('BEGIN');
    try {
      const update = db.prepare('UPDATE ratings SET payload = ? WHERE id = ?');
      for (const row of db.prepare('SELECT id, payload FROM ratings').all()) {
        const { flavor, body, ...rating } = JSON.parse(row.payload);
        if (flavor !== undefined) update.run(JSON.stringify({ ...rating, overall: rating.overall * 2, aroma: rating.aroma * 2, taste: flavor * 2, wouldDrinkAgain: 5 }), row.id);
      }
      db.prepare('INSERT INTO migrations (id) VALUES (?)').run('ratings-ten-point');
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  if (seed && !db.prepare('SELECT id FROM migrations WHERE id = ?').get('club-first-tastings')) {
    db.exec('BEGIN');
    try {
      const insert = db.prepare('INSERT OR IGNORE INTO coffees (id, payload) VALUES (?, ?)');
      for (const coffee of starterCoffees) {
        const exists = db.prepare("SELECT id FROM coffees WHERE lower(json_extract(payload, '$.name')) = ?").get(coffee.name.toLowerCase());
        if (!exists) insert.run(coffee.id, JSON.stringify({ ...coffee, updatedAt: new Date().toISOString() }));
      }
      db.prepare('INSERT INTO migrations (id) VALUES (?)').run('club-first-tastings');
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  const list = kind => db.prepare(`SELECT payload FROM ${kind}`).all().map(row => JSON.parse(row.payload));
  const all = () => ({ coffees: list('coffees'), recipes: list('recipes'), ratings: list('ratings') });
  function save(kind, input, id) {
    const value = validate(kind, input);
    if (id && !db.prepare(`SELECT id FROM ${kind} WHERE id = ?`).get(id)) throw new Error('Entry not found.');
    const existing = kind === 'ratings' ? db.prepare('SELECT id FROM ratings WHERE coffeeId = ? AND member = ?').get(value.coffeeId, value.name.toLowerCase()) : null;
    const entry = { ...value, id: existing?.id ?? id ?? randomUUID(), updatedAt: new Date().toISOString() };
    if (kind === 'ratings') {
      if (!db.prepare('SELECT id FROM coffees WHERE id = ?').get(value.coffeeId)) throw new Error('Coffee not found.');
      db.prepare('INSERT INTO ratings (id, coffeeId, member, payload) VALUES (?, ?, ?, ?) ON CONFLICT(coffeeId, member) DO UPDATE SET payload = excluded.payload').run(entry.id, value.coffeeId, value.name.toLowerCase(), JSON.stringify(entry));
    } else {
      db.prepare(`INSERT INTO ${kind} (id, payload) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload`).run(entry.id, JSON.stringify(entry));
    }
    return entry;
  }
  function remove(kind, id) {
    if (!['coffees', 'recipes', 'ratings'].includes(kind)) throw new Error('Invalid entry type.');
    return db.prepare(`DELETE FROM ${kind} WHERE id = ?`).run(id).changes > 0;
  }
  return { all, save, remove, close: () => db.close() };
}