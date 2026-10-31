import express from 'express';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStore } from './store.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const store = createStore(process.env.COFFEE_DB || resolve(root, 'data/coffee-club.sqlite'), { seed: true });
const app = express();
app.use(express.json({ limit: '1mb' }));
app.get('/api/journal', (request, response) => response.json(store.all()));
app.get('/api/backup', (request, response) => {
  response.attachment(`coffee-club-${new Date().toISOString().slice(0, 10)}.json`).json({ version: 1, exportedAt: new Date().toISOString(), ...store.all() });
});
app.post('/api/:kind', (request, response, next) => {
  try { response.status(201).json(store.save(request.params.kind, request.body)); } catch (error) { next(error); }
});
app.put('/api/:kind/:id', (request, response, next) => {
  try {
    if (!['coffees', 'recipes'].includes(request.params.kind)) throw new Error('Invalid entry type.');
    response.json(store.save(request.params.kind, request.body, request.params.id));
  } catch (error) { next(error); }
});
app.delete('/api/:kind/:id', (request, response, next) => {
  try {
    if (!store.remove(request.params.kind, request.params.id)) return response.status(404).json({ error: 'Entry not found.' });
    response.json({ success: true });
  } catch (error) { next(error); }
});
app.use('/api', (request, response) => response.status(404).json({ error: 'Endpoint not found.' }));
app.use((error, request, response, next) => {
  response.status(400).json({ error: error.message || 'Unable to save this entry.' });
});
app.use(express.static(resolve(root, 'dist')));
app.get('/{*path}', (request, response) => response.sendFile(resolve(root, 'dist/index.html')));
const server = app.listen(Number(process.env.PORT) || 3001, '0.0.0.0', () => console.log(`Coffee Club server: http://localhost:${server.address().port}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => { store.close(); process.exit(0); }));