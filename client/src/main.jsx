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
