import { Link } from 'react-router-dom';
import { PageHeader, BOOK_URL } from '../components/SiteLayout';
import entries from './faq-data.json';
export default function FAQ() {
  return <>
    <PageHeader title="Frequently Asked Questions" tagline="Everything you need to know" />
    <section><h2>Frequently Asked Questions (FAQs)</h2>
      <div className="faq">{entries.map(({ q, a }) => <details key={q}><summary>{q}</summary>{q.startsWith('10.') ? <>
        <p>You can contact Ice Cold Auto Aircon by phone or email to enquire about our services, request a quotation, and arrange a booking.</p>
        <p><strong>Phone:</strong> <a href="tel:0615428985">061 542 8985</a><br /><strong>Email:</strong> <a href="mailto:bookings@icecoldauto.co.za">bookings@icecoldauto.co.za</a></p>
      </> : <p>{a}</p>}</details>)}</div>
      <div className="faq-end"><p><strong>Ice Cold Auto Aircon</strong><br />Stay Cool. Drive Comfort.</p>
        <p>Your comfort on every journey matters to us.</p><Link className="btn-link" to={BOOK_URL}>Book Now</Link>
      </div>
    </section>
  </>;
}
