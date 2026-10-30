import { useEffect, useState } from 'react';
import { api } from '../api';

export const fallbackServices = [
  ['Car Aircon Gas Refill (R134a)', 'R350 – R650'],
  ['Aircon Diagnostics / Pressure Check', 'R150 – R350'],
  ['Leak Detection', 'R250 – R500'],
  ['Aircon Cleaning & Sanitizing', 'R200 – R450'],
  ['Compressor Check', 'R250 – R500'],
  ['Minor Aircon Repairs', 'From R350+'],
  ['Pipe / Hose Inspection', 'R150 – R300'],
  ['Full Aircon Service Package', 'R650 – R1,500'],
  ['Mobile Call-Out Fee (Distance Dependent)', 'R100 – R500'],
  ['Workshop Inspection Quote', 'From R100'],
].map(([name, price], i) => ({ id: `demo-s-${i}`, name, price }));
export const fallbackPackages = [
  ['Basic Cooling Package', ['Gas Refill', 'Pressure Check'], 'R550'],
  ['Premium Cooling Package', ['Gas Refill', 'Diagnostics', 'Leak Detection', 'Cleaning & Sanitizing'], 'R950'],
  ['VIP Full Service Package', ['Full Diagnostics', 'Refill', 'Cleaning', 'Minor Repairs', 'System Performance Check'], 'R1,500+'],
].map(([name, items, price], i) => ({ id: `demo-p-${i}`, name, items, price }));
export function useCatalog() {
  const [catalog, setCatalog] = useState({ services: fallbackServices, packages: fallbackPackages });
  const [warning, setWarning] = useState('');
  useEffect(() => {
    let active = true;
    api('/services').then(data => {
      if (active) setCatalog({ services: data.services || [], packages: data.packages || [] });
    }).catch(() => { if (active) setWarning('Live prices are temporarily unavailable. Please contact us to confirm pricing.'); });
    return () => { active = false; };
  }, []);
  return { ...catalog, warning };
}
export function PackagesGrid({ packages }) {
  return <div className="packages">{packages.map(p => <div className="card" key={p.id}>
    <h3>{p.name}</h3><p>{p.items.map((item, index) => <span key={index}>{index > 0 && <br />}{item}</span>)}</p>
    <div className="price">{p.price}</div>
  </div>)}</div>;
}
