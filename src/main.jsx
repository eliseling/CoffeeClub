import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowDownToLine, ArrowRight, ArrowUpRight, BarChart3, BookOpen, Check, ChevronDown, Clock3, Coffee, Leaf, Menu, Pencil, Plus, Search, SlidersHorizontal, Star, Trash2, Users, X } from 'lucide-react';
import { methods as METHODS, roasts as ROASTS } from '../shared/journal.js';
import { createJournalApi } from './journal-api.js';
import './styles.css';

const photo = (id, width = 700) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${width}&q=85`;
const PHOTOS = [
  photo('photo-1447933601403-0c6688de566e'),
  photo('photo-1442512595331-e89e73853f31'),
  photo('photo-1495474472287-4d71bcdd2085'),
  photo('photo-1514432324607-a09d9b4aefdd'),
  photo('photo-1447933601403-0c6688de566e'),
  photo('photo-1509042239860-f550ce710b93'),
];
function journalPhoto(entry) {
  if (entry.image) return entry.image;
  if (entry.id === 'club-iced-biscoff-coffee') return photo('photo-1461023058943-07fcbe16d735');
  if (entry.id === 'club-korean-coffee') return PHOTOS[3];
  return PHOTOS[Math.max(0, METHODS.indexOf(entry.method) - 1)];
}
const roastLabel = coffee => coffee.roast === 'Not recorded' ? 'Roast not recorded' : `${coffee.roast} roast`;
const methodLabel = entry => entry.method === 'Not recorded' ? 'Coffee' : entry.method;
const api = createJournalApi({
  url: import.meta.env.VITE_SUPABASE_URL,
  key: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  allowLocal: !location.hostname.endsWith('.github.io'),
});
function average(ratings, dimension = 'overall') {
  return ratings.length ? ratings.reduce((total, rating) => total + rating[dimension], 0) / ratings.length : 0;
}
function dateLabel(date) {
  if (!date) return 'Date not recorded';
  return new Date(`${date}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
function Stars({ value, small = false }) {
  return <span className={`stars ${small ? 'small' : ''}`} aria-label={`${value.toFixed(1)} out of 5 stars`}>{[1, 2, 3, 4, 5].map(star => <Star key={star} size={small ? 12 : 15} className={star <= Math.round(value) ? 'filled' : ''} />)}</span>;
}
function Empty({ title, children, onAdd, label }) {
  return <div className="empty-state"><Coffee size={36} strokeWidth={1.3} /><h2>{title}</h2><p>{children}</p>{onAdd && <button className="primary" onClick={onAdd}><Plus size={17} />{label}</button>}</div>;
}
function Modal({ children, title, onClose, wide = false }) {
  const ref = useRef(null);
  useEffect(() => {
    // autoFocus runs while the dialog is still hidden, and showModal() then focuses the Close button.
    ref.current.showModal();
    ref.current.querySelector('input, select, textarea')?.focus();
  }, []);
  return <dialog ref={ref} className={wide ? 'modal wide' : 'modal'} onCancel={onClose} onClick={event => { if (event.target === ref.current) onClose(); }} aria-label={title}>
    <div className="modal-head"><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="Close dialog" title="Close"><X size={21} /></button></div>{children}
  </dialog>;
}
function Field({ label, children, full = false }) {
  return <label className={`field ${full ? 'full' : ''}`}><span>{label}</span>{children}</label>;
}
function EntryForm({ kind, entry, onSave, onClose }) {
  const recipe = kind === 'recipes';
  const [values, setValues] = useState(entry || (recipe ? { name: '', method: 'Pour over', author: '', ingredients: '', steps: '', time: '', notes: '' } : { name: '', roaster: '', origin: '', method: 'Pour over', roast: 'Light', date: new Date().toLocaleDateString('en-CA'), tags: '', notes: '' }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const field = (key, options = {}) => ({ value: values[key] ?? '', onChange: event => setValues({ ...values, [key]: event.target.value }), ...options });
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('');
    try { await onSave(kind, values, entry?.id); } catch (failure) { setError(failure.message); setBusy(false); }
  }
  return <Modal title={`${entry ? 'Edit' : 'Add'} ${recipe ? 'recipe' : 'coffee'}`} onClose={onClose} wide>
    <form onSubmit={submit} className="entry-form">
      <div className="form-grid">
        <Field label={recipe ? 'Recipe name *' : 'Coffee name *'} full><input {...field('name', { required: true, maxLength: 100, placeholder: recipe ? 'Recipe name' : 'Coffee name', autoFocus: true })} /></Field>
        {!recipe && <><Field label="Roaster"><input {...field('roaster', { maxLength: 100, placeholder: 'Roaster name' })} /></Field><Field label="Origin"><input {...field('origin', { maxLength: 100, placeholder: 'Country or region' })} /></Field></>}
        <Field label="Brew method *"><select {...field('method')}>{METHODS.map(method => <option key={method}>{method}</option>)}</select></Field>
        {recipe ? <Field label="Brew time"><input {...field('time', { maxLength: 40, placeholder: 'e.g. 3 minutes' })} /></Field> : <Field label="Roast level *"><select {...field('roast')}>{ROASTS.map(roast => <option key={roast}>{roast}</option>)}</select></Field>}
        {recipe ? <><Field label="Recipe by" full><input {...field('author', { maxLength: 80, placeholder: 'Your name' })} /></Field><Field label="Ingredients *" full><textarea {...field('ingredients', { required: true, maxLength: 2000, rows: 3, placeholder: '20 g coffee\n320 g water at 94 C' })} /></Field><Field label="Steps *" full><textarea {...field('steps', { required: true, maxLength: 2000, rows: 5, placeholder: 'Write down your brewing steps...' })} /></Field></> : <><Field label="Tasting date"><input type="date" {...field('date')} /></Field><Field label="Flavor notes"><input {...field('tags', { maxLength: 200, placeholder: 'Chocolate, citrus, honey...' })} /></Field></>}
        <Field label="Notes" full><textarea {...field('notes', { maxLength: 2000, rows: 3, placeholder: recipe ? 'Grind size, temperature, or adjustments' : 'Tasting notes' })} /></Field>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="modal-footer"><button type="button" className="secondary" onClick={onClose} disabled={busy}>Cancel</button><button className="primary" disabled={busy}><Check size={17} />{busy ? 'Saving...' : `Save ${recipe ? 'recipe' : 'coffee'}`}</button></div>
    </form>
  </Modal>;
}
function RateForm({ coffee, ratings, onSave, onClose }) {
  const [name, setName] = useState(() => { try { return localStorage.getItem('coffee-club-name') || ''; } catch { return ''; } });
  const existing = ratings.find(rating => rating.name.toLowerCase() === name.trim().toLowerCase());
  const [scores, setScores] = useState(existing || { overall: 3, aroma: 3, flavor: 3, body: 3 });
  const [notes, setNotes] = useState(existing?.notes || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  function changeName(value) {
    setName(value);
    const previous = ratings.find(rating => rating.name.toLowerCase() === value.trim().toLowerCase());
    setScores(previous || { overall: 3, aroma: 3, flavor: 3, body: 3 }); setNotes(previous?.notes || '');
  }
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      await onSave('ratings', { ...scores, name, notes, coffeeId: coffee.id });
      try { localStorage.setItem('coffee-club-name', name.trim()); } catch { /* Name memory is optional. */ }
    } catch (failure) { setError(failure.message); setBusy(false); }
  }
  return <Modal title="Rate coffee" onClose={onClose}><form onSubmit={submit} className="entry-form">
    <p className="rate-coffee-name">{coffee.name}<span>{coffee.roaster}</span></p>
    <Field label="Your name *"><input value={name} onChange={event => changeName(event.target.value)} required maxLength={80} placeholder="e.g. Alex" autoFocus /></Field>
    {existing && <p className="inline-note">You have rated this coffee before. Saving will update your rating.</p>}
    <div className="overall-rating"><span>Overall rating</span><div className="star-picker" role="group" aria-label="Overall rating">{[1, 2, 3, 4, 5].map(score => <button type="button" key={score} title={`${score} ${score === 1 ? 'star' : 'stars'}`} aria-label={`${score} ${score === 1 ? 'star' : 'stars'}`} aria-pressed={scores.overall === score} onClick={() => setScores({ ...scores, overall: score })}><Star size={32} className={score <= scores.overall ? 'filled' : ''} /></button>)}</div><small>{scores.overall} / 5</small></div>
    <div className="rating-sliders">{['aroma', 'flavor', 'body'].map(dimension => <label key={dimension}><span>{dimension}</span><input type="range" min="1" max="5" step="1" value={scores[dimension]} onChange={event => setScores({ ...scores, [dimension]: Number(event.target.value) })} /><output>{scores[dimension]}<small> / 5</small></output></label>)}</div>
    <Field label="Tasting notes"><textarea value={notes} onChange={event => setNotes(event.target.value)} maxLength={2000} rows={3} placeholder="Flavor, aroma, and body" /></Field>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="modal-footer"><button type="button" className="secondary" onClick={onClose} disabled={busy}>Cancel</button><button className="primary" disabled={busy}><Star size={17} />{busy ? 'Saving...' : 'Save rating'}</button></div>
  </form></Modal>;
}
function CoffeeDetail({ coffee, ratings, onClose, onEdit, onRate, onDelete }) {
  const score = average(ratings);
  return <Modal title={coffee.name} onClose={onClose} wide>
    <div className="detail-visual"><img src={journalPhoto(coffee)} alt={coffee.name} /><span className="method-tag">{methodLabel(coffee)}</span></div>
    <div className="detail-content"><div className="detail-meta"><span>{coffee.roaster || 'Roaster not recorded'}</span><span>{dateLabel(coffee.date)}</span></div>
      <div className="detail-facts"><span><Leaf size={15} />{coffee.origin || 'Origin not noted'}</span><span><Coffee size={15} />{roastLabel(coffee)}</span><span><Star size={15} />{score ? `${score.toFixed(1)} / 5` : 'Not rated yet'}</span></div>
      <div className="flavor-tags">{coffee.tags.split(',').filter(tag => tag.trim()).map((tag, index) => <span key={index}>{tag.trim()}</span>)}</div>
      {coffee.notes && <p className="preserve-lines">{coffee.notes}</p>}
      <section className="member-ratings"><h3>Ratings <span>{ratings.length} {ratings.length === 1 ? 'rating' : 'ratings'}</span></h3>{ratings.length ? ratings.map(rating => <div className="member-rating" key={rating.id}><span className="avatar">{rating.name.slice(0, 1).toUpperCase()}</span><div><strong>{rating.name}</strong><small>Aroma {rating.aroma} · Flavor {rating.flavor} · Body {rating.body}</small>{rating.notes && <p className="preserve-lines">{rating.notes}</p>}</div><span className="member-score"><Star size={13} />{rating.overall.toFixed(1)}</span></div>) : <p className="muted">No ratings yet.</p>}</section>
    </div>
    <div className="modal-footer detail-footer"><button className="icon-button danger" title="Delete coffee" aria-label="Delete coffee" onClick={onDelete}><Trash2 size={18} /></button><button className="secondary" onClick={onEdit}><Pencil size={15} />Edit</button><button className="primary" onClick={onRate}><Star size={17} />Rate coffee</button></div>
  </Modal>;
}
function RecipeDetail({ recipe, onClose, onEdit, onDelete }) {
  return <Modal title={recipe.name} onClose={onClose} wide><div className="detail-content recipe-detail"><div className="detail-facts"><span><Coffee size={16} />{recipe.method}</span>{recipe.time && <span><Clock3 size={16} />{recipe.time}</span>}{recipe.author && <span>By {recipe.author}</span>}</div><h3>Ingredients</h3><p className="ingredients preserve-lines">{recipe.ingredients}</p><h3>Steps</h3><p className="preserve-lines">{recipe.steps}</p>{recipe.notes && <div className="recipe-tip"><Leaf size={20} /><p className="preserve-lines">{recipe.notes}</p></div>}</div><div className="modal-footer detail-footer"><button className="icon-button danger" onClick={onDelete} title="Delete recipe" aria-label="Delete recipe"><Trash2 size={18} /></button><button className="primary" onClick={onEdit}><Pencil size={17} />Edit recipe</button></div></Modal>;
}
function Insights({ coffees, ratings }) {
  const ranked = coffees.map(coffee => ({ ...coffee, score: average(ratings.filter(rating => rating.coffeeId === coffee.id)), count: ratings.filter(rating => rating.coffeeId === coffee.id).length })).filter(coffee => coffee.score).sort((first, second) => second.score - first.score);
  if (!ranked.length) return <Empty title="No ratings yet">No rating data is available.</Empty>;
  const dimensions = ['aroma', 'flavor', 'body'];
  return <div className="insights-layout"><section className="ranking-section"><div className="section-heading"><h2>Coffee ranking</h2><Star size={22} /></div><div className="ranking-chart" role="img" aria-label={`Coffee ranking: ${ranked.map(coffee => `${coffee.name}, ${coffee.score.toFixed(1)} out of 5`).join('; ')}`}>{ranked.map((coffee, index) => <div className="ranking-row" key={coffee.id}><span className="rank-number">{String(index + 1).padStart(2, '0')}</span><div><div className="ranking-label"><strong>{coffee.name}</strong><span>{coffee.score.toFixed(1)} <Star size={12} /></span></div><div className="bar-track"><div className={`bar-fill bar-${index % 3}`} style={{ width: `${coffee.score / 5 * 100}%` }} /></div><small>{coffee.method === 'Not recorded' ? '' : `${coffee.method} · `}{coffee.count} {coffee.count === 1 ? 'rating' : 'ratings'}</small></div></div>)}</div></section><section className="profile-section"><h2>Average scores</h2><p className="muted">All ratings</p>{dimensions.map(dimension => { const score = average(ratings, dimension); return <div className="dimension-row" key={dimension}><div><span>{dimension}</span><strong>{score.toFixed(1)}<small> / 5</small></strong></div><div className="bar-track"><div className="bar-fill sage" style={{ width: `${score / 5 * 100}%` }} /></div></div>; })}<div className="profile-note"><Coffee size={25} strokeWidth={1.5} /><p>{ranked[0].name}<small>Highest-rated coffee</small></p></div></section></div>;
}

function App() {
  const [journal, setJournal] = useState({ coffees: [], ratings: [], recipes: [] });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [page, setPage] = useState('journal');
  const [search, setSearch] = useState('');
  const [method, setMethod] = useState('All coffees');
  const [roast, setRoast] = useState('All roasts');
  const [sort, setSort] = useState('Newest first');
  const [filters, setFilters] = useState(false);
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState('');
  const [exporting, setExporting] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  async function load() {
    try { setJournal(await api('journal')); setLoadError(''); } catch (error) { setLoadError(error.message); } finally { setLoading(false); }
  }
  useEffect(() => {
    // Only poll while the tab is visible so idle tabs don't use up the database's free bandwidth.
    const refresh = () => { if (document.visibilityState === 'visible') load(); };
    load();
    const interval = setInterval(refresh, 15000);
    document.addEventListener('visibilitychange', refresh);
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', refresh); };
  }, []);
  useEffect(() => { if (toast) { const timeout = setTimeout(() => setToast(''), 4000); return () => clearTimeout(timeout); } }, [toast]);
  async function save(kind, values, id) {
    await api(`${kind}${id ? `/${id}` : ''}`, { method: id ? 'PUT' : 'POST', body: JSON.stringify(values) });
    await load(); setModal(null); setToast(kind === 'ratings' ? 'Rating saved.' : `${kind === 'coffees' ? 'Coffee' : 'Recipe'} saved.`);
  }
  async function exportJournal() {
    setExporting(true);
    try {
      const snapshot = { version: 1, exportedAt: new Date().toISOString(), ...await api('journal') };
      const url = URL.createObjectURL(new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `coffee-club-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { setToast(`Export failed: ${error.message}`); }
    finally { setExporting(false); }
  }
  async function remove() {
    setDeleteBusy(true); setDeleteError('');
    try { await api(`${modal.kind}/${modal.entry.id}`, { method: 'DELETE' }); await load(); setModal(null); setToast('Entry deleted.'); } catch (error) { setDeleteError(error.message); } finally { setDeleteBusy(false); }
  }
  function navigate(destination) { setPage(destination); setSearch(''); setMethod('All coffees'); setRoast('All roasts'); setNavOpen(false); }
  const coffees = journal.coffees;
  const recipes = journal.recipes;
  const coffeeRatings = coffee => journal.ratings.filter(rating => rating.coffeeId === coffee.id);
  const scoreOf = coffee => average(coffeeRatings(coffee));
  const filteredCoffees = coffees.filter(coffee => `${coffee.name} ${coffee.roaster} ${coffee.origin} ${coffee.tags}`.toLowerCase().includes(search.toLowerCase()) && (method === 'All coffees' || coffee.method === method) && (roast === 'All roasts' || coffee.roast === roast)).sort((first, second) => sort === 'Top rated' ? scoreOf(second) - scoreOf(first) : sort === 'Name A-Z' ? first.name.localeCompare(second.name) : second.date.localeCompare(first.date));
  const filteredRecipes = recipes.filter(recipe => `${recipe.name} ${recipe.author} ${recipe.method}`.toLowerCase().includes(search.toLowerCase()) && (method === 'All coffees' || recipe.method === method));
  const members = new Set(journal.ratings.map(rating => rating.name.toLowerCase())).size;
  const heading = page === 'journal' ? 'Coffees' : page === 'recipes' ? 'Recipes' : 'Ratings';
  const add = () => setModal({ type: 'form', kind: page === 'recipes' ? 'recipes' : 'coffees' });
  const navItems = [{ key: 'journal', label: 'Coffees', icon: Coffee }, { key: 'recipes', label: 'Recipes', icon: BookOpen }, { key: 'insights', label: 'Ratings', icon: BarChart3 }];
  const selectedCoffee = modal?.type === 'coffee' ? journal.coffees.find(coffee => coffee.id === modal.entry.id) || modal.entry : null;

  return <div className="app-shell">
    <aside className={`sidebar ${navOpen ? 'open' : ''}`}><a href="#" className="brand" onClick={event => { event.preventDefault(); navigate('journal'); }}><span className="brand-icon"><Coffee size={25} strokeWidth={1.6} /></span><span>Coffee Club</span></a>
      <nav aria-label="Main navigation">{navItems.map(({ key, label, icon: Icon }) => <button key={key} className={`nav-item ${page === key ? 'active' : ''}`} onClick={() => navigate(key)} aria-current={page === key ? 'page' : undefined}><Icon size={19} strokeWidth={1.6} />{label}{key === 'journal' && <span className="nav-count">{journal.coffees.length}</span>}</button>)}</nav>
      <div className="sidebar-bottom"><button className="backup-link" onClick={exportJournal} disabled={exporting}><ArrowDownToLine size={17} />{exporting ? 'Exporting...' : 'Export journal'}<ArrowUpRight size={14} /></button><div className="sidebar-foot"><span className={`status-dot ${loadError ? 'offline' : ''}`} />{loadError ? 'Connection unavailable' : loading ? 'Connecting...' : 'Connected'}</div></div>
    </aside>
    {navOpen && <button className="nav-scrim" onClick={() => setNavOpen(false)} aria-label="Close navigation" />}
    <main className="main-content"><header className="topbar"><div className="breadcrumb"><button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setNavOpen(true)}><Menu size={22} /></button><span className="desktop-breadcrumb">Coffee Club</span><span className="mobile-brand">Coffee Club</span><span className="breadcrumb-slash">/</span><strong>{heading}</strong></div><div className="topbar-right"><span className="today">{new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</span><span className="club-avatar" title="Coffee Club"><Coffee size={18} /></span></div></header>
      <div className="page-content"><div className="page-heading"><h1>{heading}</h1><button className="primary" onClick={add}><Plus size={18} />{page === 'recipes' ? 'Add recipe' : 'Add coffee'}</button></div>
      <section className="stats-strip" aria-label="Club statistics"><div><span className="stat-icon"><Coffee size={20} strokeWidth={1.5} /></span><div><strong>{journal.coffees.length}<span>Coffees tasted</span></strong></div></div><div><span className="stat-icon"><Star size={20} strokeWidth={1.5} /></span><div><strong>{journal.ratings.length ? average(journal.ratings).toFixed(1) : '—'}<span>Average rating <small>/ 5</small></span></strong></div></div><div><span className="stat-icon"><Users size={20} strokeWidth={1.5} /></span><div><strong>{members}<span>Members with ratings</span></strong></div></div><div><span className="stat-icon"><BookOpen size={20} strokeWidth={1.5} /></span><div><strong>{journal.recipes.length}<span>Recipes</span></strong></div></div></section>
      {loadError ? <div className="connection-error" role="alert"><p>{loadError}</p><button className="secondary" onClick={load}>Try again</button></div> : loading ? <div className="loading-state"><Coffee size={28} />Loading...</div> : <>
        {page !== 'insights' && <><div className="collection-heading"><h2>{page === 'journal' ? 'Saved coffees' : 'Saved recipes'}<span>{page === 'journal' ? filteredCoffees.length : filteredRecipes.length}</span></h2></div><div className="collection-toolbar"><div className="search-field"><Search size={17} /><input aria-label={page === 'journal' ? 'Search coffees' : 'Search recipes'} placeholder={page === 'journal' ? 'Search coffees, roasters, or origins' : 'Search recipes'} value={search} onChange={event => setSearch(event.target.value)} />{search && <button className="icon-button" aria-label="Clear search" onClick={() => setSearch('')}><X size={15} /></button>}</div><div className="toolbar-options"><label className="select-wrap"><Coffee size={15} /><select aria-label="Filter by brew method" value={method} onChange={event => setMethod(event.target.value)}><option value="All coffees">{page === 'recipes' ? 'All methods' : 'All coffees'}</option>{METHODS.map(item => <option key={item}>{item}</option>)}</select><ChevronDown size={14} /></label>{page === 'journal' && <><label className="select-wrap sort-select"><select aria-label="Sort coffees" value={sort} onChange={event => setSort(event.target.value)}>{['Newest first', 'Top rated', 'Name A-Z'].map(item => <option key={item}>{item}</option>)}</select><ChevronDown size={14} /></label><button className={`icon-button filter-button ${filters ? 'selected' : ''}`} aria-label="Roast filters" title="Filter by roast level" aria-expanded={filters} onClick={() => setFilters(!filters)}><SlidersHorizontal size={18} /></button></>}</div></div>{filters && page === 'journal' && <div className="roast-filters"><span>Roast level</span>{['All roasts', ...ROASTS].map(level => <button key={level} className={roast === level ? 'active' : ''} onClick={() => setRoast(level)} aria-pressed={roast === level}>{level}</button>)}</div>}</>}
        {page === 'journal' && (filteredCoffees.length ? <div className="coffee-grid">{filteredCoffees.map((coffee, index) => { const score = scoreOf(coffee); const ratings = coffeeRatings(coffee); return <article className="coffee-card" key={coffee.id} style={{ '--index': index }}><button className="card-image-button" onClick={() => setModal({ type: 'coffee', entry: coffee })} aria-label={`View ${coffee.name}`}><img loading={index < 3 ? 'eager' : 'lazy'} src={journalPhoto(coffee)} alt={coffee.name} /><span className="method-tag">{methodLabel(coffee)}</span></button><div className="card-body"><span className="roaster-name">{coffee.roaster || 'ROASTER NOT RECORDED'}</span><h3><button onClick={() => setModal({ type: 'coffee', entry: coffee })}>{coffee.name}</button></h3><div className="coffee-origin"><span><Leaf size={12} />{coffee.origin || 'Origin not noted'}</span><span className="origin-dot" />{roastLabel(coffee)}</div><div className="flavor-tags">{coffee.tags.split(',').filter(tag => tag.trim()).slice(0, 3).map((tag, tagIndex) => <span key={tagIndex}>{tag.trim()}</span>)}</div><div className="card-rating"><div><Stars value={score} small /><strong>{score ? score.toFixed(1) : '—'}</strong><span>{ratings.length} {ratings.length === 1 ? 'rating' : 'ratings'}</span></div><button className="card-arrow" title="Rate coffee" aria-label={`Rate ${coffee.name}`} onClick={() => setModal({ type: 'rate', entry: coffee })}><ArrowUpRight size={18} /></button></div></div><div className="card-date"><Clock3 size={12} />{coffee.date ? 'Tasted ' : ''}{dateLabel(coffee.date)}</div></article>; })}</div> : <Empty title={coffees.length ? 'No matching coffees' : 'No coffees'} onAdd={!coffees.length ? add : undefined} label="Add coffee">{coffees.length ? 'No coffees match the search or filters.' : 'No coffees have been added.'}</Empty>)}
        {page === 'recipes' && (filteredRecipes.length ? <div className="recipe-grid">{filteredRecipes.map(recipe => <article className="recipe-card" key={recipe.id}><button className="recipe-image" onClick={() => setModal({ type: 'recipe', entry: recipe })} aria-label={`View ${recipe.name}`}><img src={journalPhoto(recipe)} alt={`${methodLabel(recipe)} brew`} /><span className="method-tag">{methodLabel(recipe)}</span></button><div className="recipe-card-body"><span className="roaster-name">{recipe.author ? `BY ${recipe.author}` : 'AUTHOR NOT RECORDED'}</span><h3><button onClick={() => setModal({ type: 'recipe', entry: recipe })}>{recipe.name}</button></h3><p>{recipe.notes || recipe.ingredients.split('\n')[0]}</p><div className="recipe-card-footer"><span><Clock3 size={14} />{recipe.time || 'Time not recorded'}</span><button onClick={() => setModal({ type: 'recipe', entry: recipe })}>View recipe<ArrowRight size={16} /></button></div></div></article>)}</div> : <Empty title={recipes.length ? 'No matching recipes' : 'No recipes'} onAdd={!recipes.length ? add : undefined} label="Add recipe">{recipes.length ? 'No recipes match the search or filters.' : 'No recipes have been added.'}</Empty>)}
        {page === 'insights' && <Insights coffees={coffees} ratings={journal.ratings} />}
      </>}
    </div></main>
    {toast && <div className={`toast ${toast.startsWith('Export failed:') ? 'error' : ''}`} role="status"><span>{toast.startsWith('Export failed:') ? <X size={16} /> : <Check size={16} />}</span>{toast}<button className="icon-button" onClick={() => setToast('')} aria-label="Dismiss notification"><X size={15} /></button></div>}
    {modal?.type === 'form' && <EntryForm key={modal.entry?.id || modal.kind} kind={modal.kind} entry={modal.entry} onSave={save} onClose={() => setModal(null)} />}
    {modal?.type === 'rate' && <RateForm coffee={modal.entry} ratings={coffeeRatings(modal.entry)} onSave={save} onClose={() => setModal(null)} />}
    {selectedCoffee && <CoffeeDetail coffee={selectedCoffee} ratings={coffeeRatings(selectedCoffee)} onClose={() => setModal(null)} onEdit={() => setModal({ type: 'form', kind: 'coffees', entry: selectedCoffee })} onRate={() => setModal({ type: 'rate', entry: selectedCoffee })} onDelete={() => { setDeleteError(''); setModal({ type: 'delete', kind: 'coffees', entry: selectedCoffee }); }} />}
    {modal?.type === 'recipe' && <RecipeDetail recipe={modal.entry} onClose={() => setModal(null)} onEdit={() => setModal({ type: 'form', kind: 'recipes', entry: modal.entry })} onDelete={() => { setDeleteError(''); setModal({ type: 'delete', kind: 'recipes', entry: modal.entry }); }} />}
    {modal?.type === 'delete' && <Modal title={`Delete this ${modal.kind === 'coffees' ? 'coffee' : 'recipe'}?`} onClose={() => { if (!deleteBusy) setModal(null); }}><div className="detail-content"><p><strong>{modal.entry.name}</strong> will be permanently removed{modal.kind === 'coffees' ? ', along with its ratings' : ''}. This cannot be undone.</p>{deleteError && <p className="form-error" role="alert">{deleteError}</p>}</div><div className="modal-footer"><button className="secondary" disabled={deleteBusy} onClick={() => setModal(null)}>Cancel</button><button className="primary destructive" disabled={deleteBusy} onClick={remove}><Trash2 size={16} />{deleteBusy ? 'Deleting...' : 'Delete entry'}</button></div></Modal>}
  </div>;
}

createRoot(document.getElementById('root')).render(<App />);