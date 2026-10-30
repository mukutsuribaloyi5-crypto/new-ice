import { useEffect, useState } from 'react';
import { api } from '../api';
import { PageHeader } from '../components/SiteLayout';
const stars = rating => '★'.repeat(rating) + '☆'.repeat(5 - rating);
function niceDate(value) {
  const date = new Date(value.replace(' ', 'T') + 'Z');
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
}
export default function Reviews() {
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  const [sending, setSending] = useState(false);
  useEffect(() => { api('/reviews').then(setData).catch(() => setLoadError(true)); }, []);
  async function submit(e) {
    e.preventDefault(); setSending(true); setMessage(''); setError(false);
    const form = e.currentTarget;
    try {
      await api('/reviews', { method: 'POST', body: Object.fromEntries(new FormData(form)) });
      form.reset(); setMessage('Thank you! Your review will appear here once we have approved it.');
    } catch (err) { setError(true); setMessage(err.message); }
    finally { setSending(false); }
  }
  return <>
    <PageHeader title="Customer Reviews" tagline="Hear from our customers" />
    <section><h2>What Our Customers Say</h2>
      <div className="review-summary">
        {loadError ? 'Reviews could not be loaded right now.' : !data ? 'Loading reviews…' : !data.count ? 'No reviews yet – be the first to leave one!' : <>
          <span className="big">{data.average.toFixed(1)}</span> <span className="stars">{stars(Math.round(data.average))}</span>
          <div className="muted">Based on {data.count} review{data.count === 1 ? '' : 's'}</div>
        </>}
      </div>
      <div className="review-list">{data?.reviews?.map(r => <div className="review-card" key={r.id}>
        <div className="stars">{stars(r.rating)}</div><p>{r.comment}</p><div className="who">{r.name} · {niceDate(r.created_at)}</div>
      </div>)}</div>
    </section>
    <section><h2>Leave a Review</h2><form className="review-form" onSubmit={submit}>
      <input type="text" name="name" placeholder="Your name" maxLength={60} required />
      <div>Your rating:</div>
      <div className="star-input" role="radiogroup" aria-label="Star rating">
        {[5,4,3,2,1].map(n => <span key={n} className="star-option"><input type="radio" name="rating" id={`star${n}`} value={n} required={n === 5} /><label htmlFor={`star${n}`} title={`${n} stars`}>★</label></span>)}
      </div>
      <textarea name="comment" placeholder="Tell us about your experience…" minLength={10} maxLength={1000} required />
      <input type="text" name="website" className="hp" tabIndex={-1} autoComplete="off" aria-hidden="true" />
      <button type="submit" disabled={sending}>{sending ? 'Submitting…' : 'Submit Review'}</button>
      <p id="reviewMsg" className={error ? 'err' : 'ok'} role="status">{message}</p>
    </form></section>
  </>;
}
