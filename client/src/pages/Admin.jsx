import { useCallback, useEffect, useState } from 'react';
import { adminApi } from '../api';

const TABS = { bookings: 'Bookings', availability: 'Availability', reviews: 'Reviews', services: 'Services', packages: 'Packages', account: 'Account' };
const STATUSES = ['new', 'confirmed', 'completed', 'cancelled'];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const prettyDate = d => new Date(d + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const when = s => new Date(s.replace(' ', 'T') + 'Z').toLocaleString();
const waLink = phone => {
  let digits = String(phone || '').replace(/\D/g, '');
  if (digits.startsWith('0')) digits = '27' + digits.slice(1);
  return `https://wa.me/${digits}`;
};

function Login({ request, notify, onLogin }) {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  async function login(e) {
    e.preventDefault(); setBusy(true);
    try { await request('/login', { method: 'POST', body: { username, password } }); onLogin(); }
    catch (err) { notify(err.message, true); }
    finally { setBusy(false); }
  }
  return <form className="card login" onSubmit={login}>
    <h2>Admin login</h2>
    <label htmlFor="admin-user">Username</label><input id="admin-user" autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} required />
    <label htmlFor="admin-pass">Password</label><input id="admin-pass" autoComplete="current-password" type="password" value={password} onChange={e => setPassword(e.target.value)} required />
    <button type="submit" disabled={busy}>{busy ? 'Logging in…' : 'Log in'}</button>
  </form>;
}
function useRows(path, request, notify) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    try { setRows(await request(path)); }
    catch (err) { notify(err.message, true); }
    finally { setLoading(false); }
  }, [path, request, notify]);
  useEffect(() => { load(); }, [load]);
  return { rows, loading, load };
}
function BookingCard({ booking: b, request, notify, reload }) {
  const [notes, setNotes] = useState(b.notes || '');
  const [status, setStatus] = useState(b.status);
  async function updateStatus(value) {
    try { await request(`/bookings/${b.id}`, { method: 'PATCH', body: { status: value } }); setStatus(value); notify('Status updated'); reload(); }
    catch (e) { notify(e.message, true); }
  }
  async function saveNotes() {
    try { await request(`/bookings/${b.id}`, { method: 'PATCH', body: { notes } }); notify('Notes saved'); }
    catch (e) { notify(e.message, true); }
  }
  async function remove() {
    if (!window.confirm('Delete this booking permanently?')) return;
    try { await request(`/bookings/${b.id}`, { method: 'DELETE' }); notify('Booking deleted'); reload(); }
    catch (e) { notify(e.message, true); }
  }
  return <div className={'card ' + status}>
    <strong>{b.name}</strong><span className="meta"> · received {when(b.created_at)}</span>
    <p className="meta"><a href={`tel:${b.phone}`}>{b.phone}</a> · <a href={waLink(b.phone)} target="_blank" rel="noopener noreferrer">WhatsApp</a> · <a href={`mailto:${b.email}`}>{b.email}</a></p>
    <p>{b.make} {b.model} ({b.year}) – wants service on {b.service_date}{b.service_time ? ` at ${b.service_time}` : ''}</p>
    {b.info && <p className="meta">{b.info}</p>}
    <div className="row"><div><label htmlFor={`status-${b.id}`}>Status</label><select id={`status-${b.id}`} value={status} onChange={e => updateStatus(e.target.value)}>{STATUSES.map(s => <option key={s} value={s}>{s}</option>)}</select></div></div>
    <label htmlFor={`notes-${b.id}`}>Private notes</label><textarea id={`notes-${b.id}`} placeholder="Private notes (quote given, parts needed...)" value={notes} onChange={e => setNotes(e.target.value)} />
    <div className="actions"><button className="small" onClick={saveNotes}>Save notes</button><button className="small danger" onClick={remove}>Delete</button></div>
  </div>;
}
function Bookings({ request, notify }) {
  const [filter, setFilter] = useState('');
  const { rows, loading, load } = useRows('/bookings' + (filter ? `?status=${filter}` : ''), request, notify);
  return <><h2>Bookings ({rows.length})</h2><div className="row"><div>
    <select aria-label="Filter booking status" value={filter} onChange={e => setFilter(e.target.value)}><option value="">All bookings</option>{STATUSES.map(s => <option key={s} value={s}>{s}</option>)}</select>
  </div></div>{loading ? <p className="empty">Loading bookings…</p> : !rows.length ? <p className="empty">No bookings yet.</p> : rows.map(b => <BookingCard key={b.id} booking={b} request={request} notify={notify} reload={load} />)}</>;
}
function Availability({ request, notify }) {
  const { rows, loading, load } = useRows('/availability', request, notify);
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Johannesburg' });
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState('');
  const [from, setFrom] = useState('08:00');
  const [to, setTo] = useState('16:00');
  const [length, setLength] = useState('60');
  const [days, setDays] = useState([1,2,3,4,5]);
  const [busy, setBusy] = useState(false);
  async function add(e) {
    e.preventDefault(); setBusy(true);
    try {
      const result = await request('/availability', { method: 'POST', body: { startDate, endDate, from, to, length, weekdays: days } });
      notify(result.added ? `${result.added} time(s) added` : 'Nothing new was added (those times may already exist)'); load();
    } catch (err) { notify(err.message, true); }
    finally { setBusy(false); }
  }
  async function remove(path, confirmMessage) {
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    try { await request(path, { method: 'DELETE' }); notify('Time removed'); load(); }
    catch (err) { notify(err.message, true); }
  }
  const grouped = rows.reduce((acc, s) => { (acc[s.date] ||= []).push(s); return acc; }, {});
  return <>
    <h2>When are you available?</h2>
    <p className="meta">Add the dates and times you can take customers. The website only lets customers pick from these times. A time disappears from the website once someone books it.</p>
    <form className="card" onSubmit={add}>
      <div className="row"><div><label htmlFor="start-date">From date</label><input id="start-date" type="date" min={today} value={startDate} onChange={e => setStartDate(e.target.value)} required /></div>
        <div><label htmlFor="end-date">To date (leave empty for one day)</label><input id="end-date" type="date" min={today} value={endDate} onChange={e => setEndDate(e.target.value)} /></div></div>
      <label>On these days</label><div className="days">{DAY_NAMES.map((name, i) => <label key={i} className="check"><input type="checkbox" checked={days.includes(i)} onChange={e => setDays(prev => e.target.checked ? [...prev, i] : prev.filter(d => d !== i))} />{name}</label>)}</div>
      <div className="row"><div><label htmlFor="from-time">Available from</label><input type="time" id="from-time" value={from} onChange={e => setFrom(e.target.value)} required /></div>
        <div><label htmlFor="to-time">Available until</label><input type="time" id="to-time" value={to} onChange={e => setTo(e.target.value)} required /></div>
        <div><label htmlFor="slot-length">Each booking takes</label><select id="slot-length" value={length} onChange={e => setLength(e.target.value)}><option value="30">30 minutes</option><option value="60">1 hour</option><option value="120">2 hours</option><option value="240">4 hours</option></select></div></div>
      <div className="actions"><button disabled={busy} type="submit">{busy ? 'Adding…' : 'Add these times'}</button></div>
    </form>
    <h2>Your upcoming times</h2>
    {loading ? <p className="empty">Loading times…</p> : !rows.length && <p className="empty">No times added yet. Customers cannot book until you add some.</p>}
    {Object.entries(grouped).map(([date, slots]) => <div className="card" key={date}>
      <div className="row"><strong>{prettyDate(date)}</strong>{slots.some(s => !s.booking_id) && <div><button className="small danger" onClick={() => remove(`/availability/day/${date}`, 'Remove all free times on this day? Booked times stay.')}>Remove free times</button></div>}</div>
      <div className="slots">{slots.map(s => s.booking_id ? <span key={s.id} className="slot booked">{s.start_time}–{s.end_time} · booked by {s.customer || 'a customer'}</span> : <span key={s.id} className="slot">{s.start_time}–{s.end_time} <button type="button" className="x" title="Remove this time" aria-label={`Remove ${s.start_time} on ${date}`} onClick={() => remove(`/availability/${s.id}`)}>✕</button></span>)}</div>
    </div>)}
  </>;
}
function ReviewsAdmin({ request, notify }) {
  const { rows, loading, load } = useRows('/reviews', request, notify);
  const pending = rows.filter(r => r.status === 'pending').length;
  async function update(id, status) {
    try { await request(`/reviews/${id}`, { method: 'PATCH', body: { status } }); notify(`Review ${status}`); load(); }
    catch (err) { notify(err.message, true); }
  }
  async function remove(id) {
    if (!window.confirm('Delete this review permanently?')) return;
    try { await request(`/reviews/${id}`, { method: 'DELETE' }); notify('Review deleted'); load(); }
    catch (err) { notify(err.message, true); }
  }
  return <><h2>Customer reviews{pending ? ` (${pending} waiting for approval)` : ''}</h2>
    <p className="meta">New reviews wait here until you approve them. Only approved reviews show on the website.</p>
    {loading ? <p className="empty">Loading reviews…</p> : !rows.length && <p className="empty">No reviews yet.</p>}
    {rows.map(r => <div className={'card review ' + r.status} key={r.id}>
      <strong>{r.name}</strong><span className="meta"> · {'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)} · {when(r.created_at)} · {r.status}</span>
      <p>{r.comment}</p><div className="actions">
        {r.status !== 'approved' && <button className="small" onClick={() => update(r.id, 'approved')}>Approve</button>}
        {r.status !== 'hidden' && <button className="small ghost" onClick={() => update(r.id, 'hidden')}>Hide</button>}
        <button className="small danger" onClick={() => remove(r.id)}>Delete</button>
      </div>
    </div>)}
  </>;
}
function CatalogEntry({ kind, item, request, notify, reload }) {
  const isPkg = kind === 'packages';
  const [values, setValues] = useState({ name: item.name, price: item.price, sort_order: item.sort_order, active: Boolean(item.active), items: item.items || '' });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setValues(old => ({ ...old, [k]: v }));
  async function save(e) {
    e.preventDefault(); setBusy(true);
    const body = { ...values };
    if (!isPkg) delete body.items;
    try {
      await request(item.id ? `/${kind}/${item.id}` : `/${kind}`, { method: item.id ? 'PUT' : 'POST', body });
      notify('Saved'); reload();
      if (!item.id) setValues({ name: '', price: '', sort_order: item.sort_order + 1, active: true, items: '' });
    } catch (err) { notify(err.message, true); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (!window.confirm('Delete this permanently?')) return;
    try { await request(`/${kind}/${item.id}`, { method: 'DELETE' }); notify('Deleted'); reload(); }
    catch (err) { notify(err.message, true); }
  }
  return <form className="card" onSubmit={save}><div className="row">
    <div><label>Name</label><input value={values.name} placeholder={isPkg ? 'Package name' : 'Service name'} onChange={e => set('name', e.target.value)} required /></div>
    <div><label>Price</label><input value={values.price} placeholder="e.g. R350 – R650" onChange={e => set('price', e.target.value)} required /></div>
    <div><label>Order</label><input type="number" value={values.sort_order} onChange={e => set('sort_order', e.target.value)} required /></div>
    <label className="check"><input type="checkbox" checked={values.active} onChange={e => set('active', e.target.checked)} />Show</label>
  </div>
    {isPkg && <div className="row"><div><label>Included items (one per line)</label><textarea value={values.items} onChange={e => set('items', e.target.value)} required /></div></div>}
    <div className="actions"><button className="small" type="submit" disabled={busy}>{busy ? 'Saving…' : item.id ? 'Save' : 'Add new'}</button>
      {item.id && <button className="small danger" type="button" onClick={remove}>Delete</button>}
    </div>
  </form>;
}
function CatalogAdmin({ kind, request, notify }) {
  const { rows, loading, load } = useRows(`/${kind}`, request, notify);
  return <><h2>{kind === 'packages' ? 'Special packages' : 'Services & price list'}</h2>
    <p className="meta">Changes appear on the public website straight away. Untick "Show" to hide an item without deleting it.</p>
    {loading ? <p className="empty">Loading…</p> : <>{rows.map(item => <CatalogEntry key={item.id} kind={kind} item={item} request={request} notify={notify} reload={load} />)}
      <CatalogEntry key="new" kind={kind} item={{ id: null, name: '', price: '', items: '', sort_order: rows.length, active: 1 }} request={request} notify={notify} reload={load} /></>}
  </>;
}
function Account({ request, notify }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  async function change(e) {
    e.preventDefault(); setBusy(true);
    try { await request('/password', { method: 'POST', body: { current, next } }); setCurrent(''); setNext(''); notify('Password changed'); }
    catch (err) { notify(err.message, true); }
    finally { setBusy(false); }
  }
  return <><h2>Change password</h2><form className="card" onSubmit={change}>
    <label>Current password</label><input type="password" autoComplete="current-password" value={current} onChange={e => setCurrent(e.target.value)} required />
    <label style={{ marginTop: 12 }}>New password (at least 10 characters)</label><input type="password" autoComplete="new-password" value={next} minLength={10} onChange={e => setNext(e.target.value)} required />
    <div className="actions"><button disabled={busy} type="submit">{busy ? 'Updating…' : 'Update password'}</button></div>
  </form></>;
}
export default function Admin() {
  const [auth, setAuth] = useState(null);
  const [tab, setTab] = useState('bookings');
  const [toast, setToast] = useState(null);
  const notify = useCallback((message, error = false) => setToast({ message, error, at: Date.now() }), []);
  const request = useCallback(async (path, options) => {
    try { return await adminApi(path, options); }
    catch (e) { if (e.status === 401 && path !== '/login') setAuth(false); throw e; }
  }, []);
  useEffect(() => { request('/me').then(() => setAuth(true)).catch(() => setAuth(false)); }, [request]);
  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(null), 3000); return () => clearTimeout(id); }, [toast]);
  async function logout() {
    try { await request('/logout', { method: 'POST' }); setAuth(false); }
    catch (e) { notify(e.message, true); }
  }
  return <div className="admin-app">
    {auth === null ? <main><p className="empty">Checking admin session…</p></main> : !auth ? <Login request={request} notify={notify} onLogin={() => setAuth(true)} /> : <>
      <header className="top"><h1>Ice Cold Auto Aircon – Admin</h1>
        <nav className="tabs" aria-label="Admin sections">{Object.entries(TABS).map(([key, name]) => <button key={key} className={'ghost' + (tab === key ? ' active' : '')} onClick={() => setTab(key)}>{name}</button>)}</nav>
        <button className="ghost" onClick={logout}>Log out</button>
      </header><main>
        {tab === 'bookings' && <Bookings request={request} notify={notify} />}
        {tab === 'availability' && <Availability request={request} notify={notify} />}
        {tab === 'reviews' && <ReviewsAdmin request={request} notify={notify} />}
        {tab === 'services' && <CatalogAdmin kind="services" request={request} notify={notify} />}
        {tab === 'packages' && <CatalogAdmin kind="packages" request={request} notify={notify} />}
        {tab === 'account' && <Account request={request} notify={notify} />}
      </main>
    </>}
    <div id="toast" className={toast ? `show${toast.error ? ' err' : ''}` : ''} role="status" aria-live="polite">{toast?.message}</div>
  </div>;
}
