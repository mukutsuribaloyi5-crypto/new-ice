import { useCatalog } from '../components/Catalog';
export default function Services() {
  const { services, packages, warning } = useCatalog();
  return <div className="services-page">
    <div className="container">
      <h1>ICE COLD AUTO AIRCON</h1><h2>Workshop &amp; Mobile Service</h2>
      <p style={{ textAlign: 'center' }}>Keeping you cool, wherever you are.</p>
      <h2>Service Price List</h2>
      {warning && <p role="status">{warning}</p>}
      <table><thead><tr><th>Service</th><th>Price (R)</th></tr></thead><tbody>
        {services.map(s => <tr key={s.id}><td>{s.name}</td><td>{s.price}</td></tr>)}
      </tbody></table>
      <h2>Special Packages</h2>
      {packages.map(p => <div className="package" key={p.id}>
        <h3>{p.name} – {p.price}</h3><ul>{p.items.map((item, i) => <li key={i}>{item}</li>)}</ul>
      </div>)}
      <div className="contact">
        <p>📞 <a href="tel:0615428985">061 542 8985</a></p>
        <p>✉️ <a href="mailto:bookings@icecoldauto.co.za">bookings@icecoldauto.co.za</a></p>
        <p>📍 Gauteng &amp; Surrounding Areas</p>
      </div>
      <div className="footer"><p>Fast Service • Quality Work • Customer Satisfaction</p><p>Stay Cool, Drive Comfortably!</p></div>
    </div>
  </div>;
}
