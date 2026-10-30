import { Link } from 'react-router-dom';
import { PageHeader, BOOK_URL } from '../components/SiteLayout';
export default function Contact() {
  return <>
    <PageHeader title="Contact Us" tagline="We would love to hear from you" />
    <section>
      <div className="contact-card"><h3>📞 Call or WhatsApp</h3><p><a href="tel:0615428985">061 542 8985</a></p><p><a href="https://wa.me/27615428985" target="_blank" rel="noopener noreferrer">Chat on WhatsApp</a></p></div>
      <div className="contact-card"><h3>📧 Email</h3><p><a href="mailto:bookings@icecoldauto.co.za">bookings@icecoldauto.co.za</a></p></div>
      <div className="contact-card"><h3>📍 Where We Work</h3><p>Gauteng &amp; Surrounding Areas<br />Workshop &amp; Mobile Service</p></div>
    </section>
    <section><h2>Book a Time</h2><p>Pick a time that suits you and we will confirm with you.</p><Link className="btn-link" to={BOOK_URL}>Book Now</Link></section>
  </>;
}
