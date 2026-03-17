const LEGAL_LINKS = [
  { label: 'Privacy Policy', href: '/legal/Dubtube_Privacy_Policy.pdf' },
  { label: 'Terms of Service', href: '/legal/Dubtube_Terms_of_Service.pdf' },
  { label: 'Refund Policy', href: '/legal/Dubtube_Refund_Policy.pdf' },
  { label: 'Cookie Policy', href: '/legal/Dubtube_Cookie_Policy.pdf' },
];

export default function Footer() {
  return (
    <footer className="border-t border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
          {/* Legal links */}
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-2">
            {LEGAL_LINKS.map((link) => (
              <a
                key={link.label}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors duration-200"
              >
                {link.label}
              </a>
            ))}
          </div>

          {/* Copyright */}
          <p className="text-sm text-slate-400 dark:text-slate-500 whitespace-nowrap">
            © 2026 Dubtube
          </p>
        </div>
      </div>
    </footer>
  );
}
