export default function OfferKpPageShell({ title, subtitle, children }) {
  return (
    <div className="flex flex-col flex-1 min-w-0 h-full offerKp-chat-shell offerKp-home-shell overflow-hidden">
      <header className="offerKp-suite-page-header px-6 md:px-10 lg:px-14 py-6 border-b border-theme-sidebar-border shrink-0">
        <div className="min-w-0 pr-24 md:pr-32">
          <h1 className="offerKp-suite-page-title !mb-0">{title}</h1>
          {subtitle && (
            <p className="text-sm text-theme-text-secondary mt-2 max-w-2xl">{subtitle}</p>
          )}
        </div>
      </header>
      <div className="flex-1 overflow-y-auto px-6 md:px-10 lg:px-14 py-6">{children}</div>
    </div>
  );
}
