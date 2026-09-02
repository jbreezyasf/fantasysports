import { signOut } from '../auth/actions';

const nav = [
  { href: '/ops', label: 'Search' },
  { href: '/ops/data-health', label: 'Data Health' },
  { href: '/ops/audit', label: 'Audit' }
];

export default function OpsLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="opsShell">
      <aside className="opsRail" aria-label="Operations navigation">
        <a className="opsMark" href="/ops">BE OPS</a>
        <nav>
          {nav.map(item => <a key={item.href} href={item.href}>{item.label}</a>)}
        </nav>
        <div className="opsRailFoot">
          <span>INTERNAL</span>
          <a href="/dashboard">Front Office</a>
          <form><button formAction={signOut}>Sign out</button></form>
        </div>
      </aside>
      <div className="opsContent">{children}</div>
    </main>
  );
}
