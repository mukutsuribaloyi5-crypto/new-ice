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
  const [messageType, setMessageType] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const formRef = useRef();
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true); setErrorSlots(false); setMessage(''); setMessageType('');
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
    e.preventDefault();
    if (submitting) return;
    const form = e.currentTarget;
    if (!form.reportValidity()) return;
    setMessage(''); setMessageType(''); setSubmitting(true);
    try {
      const result = await api('/bookings', { method: 'POST', body: Object.fromEntries(new FormData(form)) });
      setMessageType(result.emailSent === false ? 'warning' : 'success');
      setMessage(result.emailSent === false
        ? 'Your booking was saved, but its email notification could not be sent. Please call 061 542 8985 to confirm.'
        : "Thanks! We've received your request and will contact you soon.");
      formRef.current?.reset();
      setSlots(await api('/availability').catch(() => []));
    } catch (err) { setMessageType('error'); setMessage(err.message || 'We could not submit your booking. Please try again or call 061 542 8985.'); }
    finally { setSubmitting(false); }
  }
  return <div className="modal" style={{ display: 'block', overflowY: 'auto' }} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }} role="presentation">
    <div className="modal-content" role="dialog" aria-modal="true" aria-labelledby="bookingTitle">
      <button className="close close-button" type="button" onClick={onClose} aria-label="Close booking form">×</button>
      <h2 id="bookingTitle">Get a Quote for Your Car Service or Repair</h2>
      <form ref={formRef} onSubmit={submit} onInvalid={() => { setMessageType('error'); setMessage('Please complete each required field and choose an available time.'); }}>
        <p className="booking-required-note"><span aria-hidden="true">*</span> Required fields</p>
        <label htmlFor="bookingName">Name <span aria-hidden="true">*</span></label>
        <input id="bookingName" type="text" name="name" placeholder="Your full name" autoComplete="name" required maxLength="100" />
        <label htmlFor="bookingPhone">Phone number <span aria-hidden="true">*</span></label>
        <input id="bookingPhone" type="tel" name="phone" placeholder="e.g. 061 542 8985" autoComplete="tel" required maxLength="30" />
        <label htmlFor="bookingEmail">Email address <span aria-hidden="true">*</span></label>
        <input id="bookingEmail" type="email" name="email" placeholder="you@example.com" autoComplete="email" required maxLength="150" />
        <label htmlFor="vehicleMake">Vehicle make <span aria-hidden="true">*</span></label>
        <input id="vehicleMake" type="text" name="make" placeholder="e.g. Toyota" required maxLength="50" />
        <label htmlFor="vehicleModel">Vehicle model <span aria-hidden="true">*</span></label>
        <input id="vehicleModel" type="text" name="model" placeholder="e.g. Corolla" required maxLength="50" />
        <label htmlFor="vehicleYear">Vehicle year <span aria-hidden="true">*</span></label>
        <input id="vehicleYear" type="text" name="year" placeholder="e.g. 2020" inputMode="numeric" required maxLength="10" />
        <label htmlFor="slotSelect">Choose an available time <span aria-hidden="true">*</span></label>
        <select name="slotId" id="slotSelect" required disabled={loading || !slots.length} defaultValue="">
          <option value="">{loading ? 'Loading available times…' : errorSlots ? 'Could not load times – please call or WhatsApp us' : !slots.length ? 'No times available right now – please call or WhatsApp us' : 'Choose an available time…'}</option>
          {Object.entries(dates).map(([date, daySlots]) => <optgroup key={date} label={new Date(date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}>
            {daySlots.map(s => <option key={s.id} value={s.id}>{s.start_time} – {s.end_time}</option>)}
          </optgroup>)}
        </select>
        <label htmlFor="bookingInfo">Additional information <span className="optional-label">(optional)</span></label>
        <textarea id="bookingInfo" name="info" placeholder="Tell us about the aircon issue or anything else we should know." maxLength="2000" />
        {!loading && !slots.length && <p className="booking-slot-help" role="status">{errorSlots ? "We could not load available times." : "There are currently no online booking times available."} Please call or WhatsApp <a href="tel:0615428985">061 542 8985</a> to arrange a booking.</p>}
        <button className="booking-submit" type="submit" disabled={submitting || loading || !slots.length} aria-busy={submitting}>
          {submitting ? <><span className="booking-spinner" aria-hidden="true" /> Submitting booking...</> : loading ? "Loading available times..." : !slots.length ? "No online times available" : "Submit Booking Request"}
        </button>
        {message && <p className={`form-msg ${messageType}`} role={messageType === "error" ? "alert" : "status"} aria-live="polite">{message}</p>}
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
    <section><h2>Car Aircon Not Cold in Gauteng?</h2><p>Ice Cold Auto Aircon provides workshop and mobile car aircon services, from regas and system checks to leak detection and repairs. Stay cool and comfortable on the road.</p></section>
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
