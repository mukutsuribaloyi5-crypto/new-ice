import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { PageHeader } from '../components/SiteLayout';

function Lightbox({ item, onClose }) {
  const closeRef = useRef(null);
  useEffect(() => {
    closeRef.current?.focus();
    const esc = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);
  return <div className="lightbox" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }} role="dialog" aria-modal="true" aria-label={item.title || 'Picture'}>
    <button ref={closeRef} className="lightbox-x" type="button" aria-label="Close picture" onClick={onClose}>×</button>
    <figure><img src={item.url} alt={item.title || 'Gallery picture'} />{item.title && <figcaption>{item.title}</figcaption>}</figure>
  </div>;
}

export default function Gallery() {
  const [items, setItems] = useState(null);
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState(null);
  useEffect(() => {
    let alive = true;
    api('/gallery').then(data => { if (alive) setItems(data); }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, []);
  return <>
    <PageHeader title="Gallery" tagline="Our work in pictures and video" />
    <section>
      {failed ? <p role="status">We could not load the gallery right now. Please try again shortly.</p>
        : items === null ? <p role="status">Loading gallery…</p>
        : !items.length ? <p role="status">Nothing here yet. Check back soon.</p>
        : <div className="gallery-grid">
          {items.map(item => <figure className="gallery-tile" key={item.id}>
            {item.type === 'video'
              ? <video src={item.url} controls preload="metadata" playsInline aria-label={item.title || 'Gallery video'} />
              : <button type="button" className="gallery-open" onClick={() => setActive(item)} aria-label={`View larger: ${item.title || 'gallery picture'}`}><img src={item.url} alt={item.title || 'Gallery picture'} loading="lazy" /></button>}
            {item.title && <figcaption>{item.title}</figcaption>}
          </figure>)}
        </div>}
    </section>
    {active && <Lightbox item={active} onClose={() => setActive(null)} />}
  </>;
}
