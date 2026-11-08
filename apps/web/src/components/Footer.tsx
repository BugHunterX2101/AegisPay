import { Seal } from './Seal.tsx';

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="wrap footer-row">
        <div className="footer-brand">
          <Seal size={24} />
          <span className="wordmark" translate="no">AegisPay</span>
        </div>
        <p className="footer-note">
          A PayPal AI Hackathon 2026 entry. Everything here runs against the PayPal sandbox and no real money moves. PayPal is a
          trademark of PayPal, Inc.; this project is not affiliated with or endorsed by PayPal.
        </p>
        <a className="link-arrow" href="https://github.com/BugHunterX2101/AegisPay" target="_blank" rel="noreferrer">
          Source on GitHub <span aria-hidden="true">↗</span>
        </a>
      </div>
    </footer>
  );
}
