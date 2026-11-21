import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';

const KEY = 'icac-sales-seen';
const readSeen = () => { try { return window.sessionStorage.getItem(KEY); } catch { return null; } };
const writeSeen = value => { try { window.sessionStorage.setItem(KEY, value); } catch { /* storage unavailable: popup may show again */ } };
const endsOn = date => new Date(date + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'long' });

// Shows the sales posted in Admin once per visit. Visitors close it and carry on.
export default function SalesPopup({ bookUrl }) {
  const [sales, setSales] = useState([]);
  const [open, setOpen] = useState(false);
  const closeRef = useRef(null);

  useEffect(() => {
    let alive = true;
    api('/sales').then(list => {
      if (!alive || !Array.isArray(list) || !list.length) return;
      if (new URLSearchParams(window.location.search).has('book')) return;   // they came to book: don't get in the way
      const signature = list.map(s => `${s.id}:${s.updated_at}`).join('|');
      if (readSeen() === signature) return;
      writeSeen(signature);
      setSales(list); setOpen(true);
    }).catch(() => { /* no pop-up if sales can't be loaded */ });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const esc = e => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', esc);
    return () => { document.body.style.overflow = previous; document.removeEventListener('keydown', esc); };
  }, [open]);

  if (!open) return null;
  const close = () => setOpen(false);
  return <div className="sale-overlay" onMouseDown={e => { if (e.target === e.currentTarget) close(); }} role="presentation">
    <div className={'sale-popup' + (sales.some(s => s.kind === 'image') ? ' has-image' : '')} role="dialog" aria-modal="true" aria-label="Sale notice">
      <button ref={closeRef} className="sale-x" type="button" aria-label="Close sale notice" onClick={close}>×</button>
      <div className="sale-list">
        {sales.map(s => <article className="sale-item" key={s.id}>
          {s.kind === 'image'
            ? <img className="sale-image" src={s.image_url} alt={s.title} />
            : <><h2>{s.title}</h2><p className="sale-text">{s.message}</p></>}
          {s.ends_on && <p className="sale-ends">Ends {endsOn(s.ends_on)}</p>}
        </article>)}
      </div>
      <div className="sale-actions">
        <Link className="sale-book" to={bookUrl} onClick={close}>Book now</Link>
        <button className="sale-dismiss" type="button" onClick={close}>Close</button>
      </div>
    </div>
  </div>;
}
