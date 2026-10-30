import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';

const links = [
  ['/', 'Home'], ['/about', 'About'], ['/services', 'Services'],
  ['/reviews', 'Reviews'], ['/faq', 'FAQs'], ['/contact', 'Contact'],
];
export const BOOK_URL = '/?book=1';
export function SiteLayout({ children }) {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const navRef = useRef(null);
  useEffect(() => { setOpen(false); }, [location.pathname, location.search]);
  useEffect(() => {
    const outside = e => { if (!navRef.current?.contains(e.target)) setOpen(false); };
    const esc = e => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', esc); };
  }, []);
  return <div className="public-site">
    <nav className="navbar" ref={navRef}>
      <div className="logo">Ice Cold Auto Aircon</div>
      <button className="menu-icon" type="button" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} aria-controls="navLinks" onClick={() => setOpen(v => !v)}>
        <span className="bar" /><span className="bar" /><span className="bar" />
      </button>
      <ul className={'nav-links' + (open ? ' show' : '')} id="navLinks">
        {links.map(([to, label]) => <li key={to}><NavLink to={to} end className={({ isActive }) => isActive ? 'active' : ''}>{label}</NavLink></li>)}
        <li><Link to={BOOK_URL}>Book Now</Link></li>
      </ul>
    </nav>
    {children}
    <footer>Fast Service • Quality Work • Customer Satisfaction<br />© 2026 Ice Cold Auto Aircon — Stay Cool, Drive Comfortably!</footer>
  </div>;
}
export function PageHeader({ title, tagline }) {
  return <header>{title}<div className="tagline">{tagline}</div></header>;
}
