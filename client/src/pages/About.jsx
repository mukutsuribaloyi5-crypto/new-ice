import { Link } from 'react-router-dom';
import { PageHeader, BOOK_URL } from '../components/SiteLayout';
export default function About() {
  return <>
    <PageHeader title="About Ice Cold Auto Aircon" tagline="Stay Cool. Drive Comfort." />
    <section><div className="page-text">
      <p>At Ice Cold Auto Aircon, we are passionate about keeping you cool and comfortable on every journey. We specialise in automotive air-conditioning services, helping motorists enjoy a cool, comfortable driving experience throughout the year.</p>
      <p>We provide convenient and reliable services, including aircon gas refills, pressure checks, leak detection, compressor checks, and air-conditioning cleaning and sanitising.</p>
      <p>Our goal is to deliver quality service, affordable prices, and customer satisfaction. With our mobile service, we aim to make it easier for you to get your vehicle’s air-conditioning system checked and serviced.</p>
      <p>Serving Gauteng and surrounding areas, we are committed to keeping your vehicle cool, so you can drive in comfort and confidence.</p>
      <p><strong>Ice Cold Auto Aircon — Stay Cool. Drive Comfort.</strong></p>
    </div></section>
    <section><h2>What Makes Us Different?</h2><div className="services">
      <div className="card"><h3>❄️ Reliable Aircon Services</h3><p>We help keep your vehicle's air-conditioning system performing at its best.</p></div>
      <div className="card"><h3>💰 Affordable Pricing</h3><p>Quality service at prices designed to offer value for money.</p></div>
      <div className="card"><h3>🚚 Mobile Convenience</h3><p>We bring our service to you, subject to location and booking availability.</p></div>
      <div className="card"><h3>🤝 Customer Satisfaction</h3><p>We aim to provide friendly service, clear communication, and a positive customer experience.</p></div>
    </div></section>
    <section><Link className="btn-link" to={BOOK_URL}>Book Now</Link></section>
  </>;
}
