import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { SiteLayout } from './components/SiteLayout';
import Home from './pages/Home';
import About from './pages/About';
import Services from './pages/Services';
import Contact from './pages/Contact';
import FAQ from './pages/FAQ';
import Reviews from './pages/Reviews';
import Admin from './pages/Admin';
import './site.css';
import './extra.css';
import './services.css';
import './admin.css';
import './fixes.css';

function Public({ children }) { return <SiteLayout>{children}</SiteLayout>; }
function Titles() {
  const { pathname } = useLocation();
  useEffect(() => {
    const titles = { '/': 'Ice Cold Auto Aircon', '/about': 'About Us', '/services': 'Services', '/reviews': 'Customer Reviews', '/faq': 'FAQs', '/contact': 'Contact Us', '/admin': 'Admin' };
    document.title = `${titles[pathname] || 'Ice Cold Auto Aircon'} – Ice Cold Auto Aircon`;
  }, [pathname]);
  useEffect(() => {
    const pages = {
      '/': ['Ice Cold Auto Aircon | Car Aircon Services in Gauteng', 'Ice Cold Auto Aircon provides workshop and mobile car air conditioning services across Gauteng, including aircon regas, leak checks and repairs.'],
      '/about': ['About Ice Cold Auto Aircon | Gauteng', 'Meet Ice Cold Auto Aircon. We help Gauteng motorists stay cool with mobile and workshop vehicle air conditioning services.'],
      '/services': ['Car Aircon Services & Prices | Ice Cold Auto Gauteng', 'See Ice Cold Auto Aircon prices for car aircon regas, pressure checks, leak detection, compressor checks and sanitising in Gauteng.'],
      '/reviews': ['Customer Reviews | Ice Cold Auto Aircon', 'Read customer reviews of Ice Cold Auto Aircon and share your experience with our vehicle air conditioning service in Gauteng.'],
      '/faq': ['Car Aircon FAQs | Ice Cold Auto Aircon', 'Answers about Ice Cold Auto Aircon services, mobile bookings, vehicle aircon checks and service areas in Gauteng.'],
      '/contact': ['Contact & Book | Ice Cold Auto Aircon Gauteng', 'Contact or book Ice Cold Auto Aircon for mobile and workshop car air conditioning services in Gauteng. Call, WhatsApp or email us.'],
    };
    if (pathname.startsWith('/admin')) {
      let robots = document.head.querySelector('meta[name="robots"]');
      if (!robots) { robots = document.createElement('meta'); robots.name = 'robots'; document.head.append(robots); }
      robots.content = 'noindex,nofollow';
      return;
    }
    let robots = document.head.querySelector('meta[name="robots"]');
    if (!robots) { robots = document.createElement('meta'); robots.name = 'robots'; document.head.append(robots); }
    robots.content = 'index,follow';
    const [title, description] = pages[pathname] || pages['/'];
    document.title = title;
    const setMeta = (selector, attributes, content) => {
      let node = document.head.querySelector(selector);
      if (!node) { node = document.createElement('meta'); document.head.append(node); }
      Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value));
      node.setAttribute('content', content);
    };
    setMeta('meta[name="description"]', { name: 'description' }, description);
    setMeta('meta[property="og:title"]', { property: 'og:title' }, title);
    setMeta('meta[property="og:description"]', { property: 'og:description' }, description);
    setMeta('meta[property="og:type"]', { property: 'og:type' }, 'website');
    setMeta('meta[name="twitter:card"]', { name: 'twitter:card' }, 'summary');
    setMeta('meta[name="twitter:title"]', { name: 'twitter:title' }, title);
    setMeta('meta[name="twitter:description"]', { name: 'twitter:description' }, description);
    let canonical = document.head.querySelector('link[rel="canonical"]');
    if (!canonical) { canonical = document.createElement('link'); canonical.rel = 'canonical'; document.head.append(canonical); }
    canonical.href = new URL(pathname, window.location.origin).href;
  }, [pathname]);
  return null;
}
function LegacyRedirect({ to }) { const { search } = useLocation(); return <Navigate replace to={to + search} />; }
function App() {
  return <BrowserRouter><Titles /><Routes>
    <Route path="/" element={<Public><Home /></Public>} />
    <Route path="/about" element={<Public><About /></Public>} />
    <Route path="/services" element={<Public><Services /></Public>} />
    <Route path="/reviews" element={<Public><Reviews /></Public>} />
    <Route path="/faq" element={<Public><FAQ /></Public>} />
    <Route path="/contact" element={<Public><Contact /></Public>} />
    <Route path="/admin/*" element={<Admin />} />
    <Route path="/HOME.html" element={<LegacyRedirect to="/" />} />
    <Route path="/About.html" element={<LegacyRedirect to="/about" />} />
    <Route path="/services.html" element={<LegacyRedirect to="/services" />} />
    <Route path="/Reviews.html" element={<LegacyRedirect to="/reviews" />} />
    <Route path="/FAQ.html" element={<LegacyRedirect to="/faq" />} />
    <Route path="/Contact.html" element={<LegacyRedirect to="/contact" />} />
    <Route path="*" element={<Public><section><h2>Page not found</h2><a href="/">Go home</a></section></Public>} />
  </Routes></BrowserRouter>;
}

createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>);
