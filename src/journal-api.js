import { createClient } from '@supabase/supabase-js';

const fields = {
  coffees: ['name', 'method', 'notes', 'roaster', 'origin', 'roast', 'date', 'tags'],
  recipes: ['name', 'method', 'notes', 'author', 'ingredients', 'steps', 'time'],
  ratings: ['name', 'notes', 'overall', 'aroma', 'flavor', 'body'],
};

function entryFromRow(kind, row) {
  const { updated_at, coffee_id, member, ...entry } = row;
  if (kind === 'coffees') entry.date = entry.date || '';
  if (kind === 'ratings') entry.coffeeId = coffee_id;
  return { ...entry, updatedAt: updated_at };
}

export function createJournalApi({ url, key, allowLocal = true, clientFactory = createClient, fetcher = fetch } = {}) {
  let client;
  let configurationError;
  if (url || key) {
    if (!url || !key) configurationError = 'Set both the Supabase URL and publishable key to connect the shared journal.';
    else if (!key.startsWith('sb_publishable_')) configurationError = 'Use a Supabase publishable key (sb_publishable_...), never a secret or service-role key, in the website.';
    else {
      try { client = clientFactory(url, key, { auth: { persistSession: false, autoRefreshToken: false } }); }
      catch { configurationError = 'The shared database configuration is invalid. Check the Supabase project URL and publishable key.'; }
    }
  } else if (!allowLocal) configurationError = 'This GitHub Pages site needs a shared Supabase database. Complete the deployment setup in the repository README.';

  async function resultOf(query, kind, many = false) {
    const { data, error } = await query;
    if (error) throw new Error(`The shared database could not complete this request: ${error.message}`);
    return many ? data.map(row => entryFromRow(kind, row)) : entryFromRow(kind, data);
  }

  return async function api(path, options = {}) {
    if (configurationError) throw new Error(configurationError);
    if (!client) {
      let response;
      try { response = await fetcher(`/api/${path}`, { ...options, headers: { 'Content-Type': 'application/json' } }); }
      catch { throw new Error('The local Coffee Club server could not be reached. Start it with npm run dev.'); }
      let result;
      try { result = await response.json(); }
      catch { throw new Error('No journal backend was found. GitHub Pages needs Supabase; localhost needs the Coffee Club server.'); }
      if (!response.ok) throw new Error(result.error || 'Something went wrong. Please try again.');
      return result;
    }
    const method = options.method || 'GET';
    if (path === 'journal' && method === 'GET') {
      const [coffees, recipes, ratings] = await Promise.all(Object.keys(fields).map(kind => resultOf(client.from(kind).select('*'), kind, true)));
      return { coffees, recipes, ratings };
    }
    const [kind, id, extra] = path.split('/');
    if (!fields[kind] || extra) throw new Error('Invalid journal request.');
    if (method === 'DELETE' && id) {
      const { data, error } = await client.from(kind).delete().eq('id', id).select('id');
      if (error) throw new Error(`Unable to delete this entry: ${error.message}`);
      if (!data.length) throw new Error('Entry not found.');
      return { success: true };
    }
    if (!['POST', 'PUT'].includes(method) || (method === 'PUT' && (!id || kind === 'ratings')) || (method === 'POST' && id)) throw new Error('Invalid journal request.');
    const value = JSON.parse(options.body);
    const row = Object.fromEntries(fields[kind].map(field => [field, value[field] ?? '']));
    if (kind === 'coffees') row.date = row.date || null;
    if (kind === 'ratings') { row.name = row.name.trim(); row.coffee_id = value.coffeeId; }
    const table = client.from(kind);
    const query = kind === 'ratings' ? table.upsert(row, { onConflict: 'coffee_id,member' }) : method === 'PUT' ? table.update(row).eq('id', id) : table.insert(row);
    return resultOf(query.select('*').single(), kind);
  };
}