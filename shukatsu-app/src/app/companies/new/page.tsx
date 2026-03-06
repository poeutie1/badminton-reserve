import { createCompany } from "@/lib/actions/company";
import { CompanyForm } from "@/components/company-form";
import Link from "next/link";

export default function NewCompanyPage() {
  return (
    <div>
      <nav className="mb-6 animate-fade-in" style={{ fontSize: '0.8rem', color: 'var(--ink-faint)' }}>
        <Link href="/" className="hover:underline" style={{ color: 'var(--ink-muted)' }}>
          企業一覧
        </Link>
        <span className="mx-2">/</span>
        <span style={{ color: 'var(--ink-light)' }}>新規追加</span>
      </nav>
      <h1
        className="text-xl mb-8 animate-slide-up delay-1"
        style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--ink)' }}
      >
        企業を追加
      </h1>
      <div className="animate-slide-up delay-2">
        <CompanyForm action={createCompany} />
      </div>
    </div>
  );
}
