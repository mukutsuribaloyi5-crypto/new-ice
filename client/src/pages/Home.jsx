import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { PackagesGrid, useCatalog } from '../components/Catalog';
import { PageHeader } from '../components/SiteLayout';

function BookingModal({ open, onClose }) {
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorSlots, setErrorSlots] = useState(false);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const formRef = useRef();
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true); setErrorSlots(false); setMessage('');
    api('/availability').then(data => { if (alive) setSlots(data); }).catch(() => { if (alive) { setSlots([]); setErrorSlots(true); } }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const handle = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
  }, [open, onClose]);
  if (!open) return null;
  const dates = Object.groupBy ? Object.groupBy(slots, s => s.date) : slots.reduce((acc, s) => { (acc[s.date] ||= []).push(s); return acc; }, {});
  async function submit(e) {
    e.preventDefault(); setMessage(''); setSubmitting(true);
    try {
      await api('/bookings', { method: 'POST', body: Object.fromEntries(new FormData(e.currentTarget)) });
      setMessage("Thanks! We've received your request and will contact you soon.");
      formRef.current?.reset();
      setSlots(await api('/availability').catch(() => []));
    } catch (err) { setMessage(err.message); }
    finally { setSubmitting(false); }
  }
  return <div className="modal" style={{ display: 'block', overflowY: 'auto' }} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }} role="presentation">
    <div className="modal-content" role="dialog" aria-modal="true" aria-labelledby="bookingTitle">
      <button className="close close-button" type="button" onClick={onClose} aria-label="Close booking form">×</button>
      <h2 id="bookingTitle">Get a Quote for Your Car Service or Repair</h2>
      <form ref={formRef} onSubmit={submit}>
        <input type="text" name="name" placeholder="Name" required maxLength="100" />
        <input type="tel" name="phone" placeholder="Phone Number" required />
        <input type="email" name="email" placeholder="Email Address" required />
        <input type="text" name="make" placeholder="Vehicle Make" required />
        <input type="text" name="model" placeholder="Vehicle Model" required />
        <input type="text" name="year" placeholder="Vehicle Year" required />
        <label htmlFor="slotSelect">Choose an available time:</label>
        <select name="slotId" id="slotSelect" required disabled={loading || !slots.length} defaultValue="">
          <option value="">{loading ? 'Loading available times…' : errorSlots ? 'Could not load times – please call or WhatsApp us' : !slots.length ? 'No times available right now – please call or WhatsApp us' : 'Choose an available time…'}</option>
          {Object.entries(dates).map(([date, daySlots]) => <optgroup key={date} label={new Date(date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}>
            {daySlots.map(s => <option key={s.id} value={s.id}>{s.start_time} – {s.end_time}</option>)}
          </optgroup>)}
        </select>
        <textarea name="info" placeholder="Additional Information (Please provide as much detail as possible)" />
        <button type="submit" disabled={submitting || !slots.length}>{submitting ? 'Submitting…' : 'Submit Details'}</button>
        {message && <p className="form-msg" role="status">{message}</p>}
      </form>
    </div>
  </div>;
}
export default function Home() {
  const { services, packages, warning } = useCatalog();
  const [searchParams, setSearchParams] = useSearchParams();
  const [bookOpen, setBookOpen] = useState(false);
  useEffect(() => { if (searchParams.get('book')) setBookOpen(true); }, [searchParams]);
  function close() { setBookOpen(false); if (searchParams.has('book')) setSearchParams(params => { const n = new URLSearchParams(params); n.delete('book'); return n; }, { replace: true }); }
  return <>
    <PageHeader title="ICE COLD AUTO AIRCON" tagline="Stay Cool. Drive Comfort." />
    <section><h2>Car Aircon Not Cold?</h2><p>We’ve got you covered! Stay cool and comfortable on the road.</p></section>
    <section><h2>Our Services</h2>{warning && <p role="status">{warning}</p>}<div className="services">
      {services.map(s => <div className="card" key={s.id}><h3>{s.name}</h3><p>{s.price}</p></div>)}
    </div></section>
    <section><h2>Special Packages</h2><PackagesGrid packages={packages} /></section>
    <button id="bookBtn" onClick={() => setBookOpen(true)}>Book Now</button>
    <section className="contact"><h2>Contact Us</h2>
      <p>📞 Call or WhatsApp: <a href="tel:0615428985">061 542 8985</a></p>
      <p>📧 Email: <a href="mailto:bookings@icecoldauto.co.za">bookings@icecoldauto.co.za</a></p>
      <p>📍 Gauteng &amp; Surrounding Areas</p>
    </section>
    <BookingModal open={bookOpen} onClose={close} />
  </>;
}
