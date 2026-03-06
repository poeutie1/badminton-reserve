import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { tierLabel } from "@/lib/utils";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; sort?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const params = await searchParams;
  const q = params.q || "";
  const sort = params.sort || "updatedAt";
  const userId = session.user.id;

  const companies = await prisma.company.findMany({
    where: q
      ? {
          userId,
          OR: [
            { name: { contains: q } },
            { industry: { contains: q } },
          ],
        }
      : { userId },
    orderBy:
      sort === "tier"
        ? { tier: "asc" }
        : { updatedAt: "desc" },
    include: {
      _count: { select: { selectionSteps: true, logs: true } },
    },
  });

  return (
    <div>
      {/* Page heading */}
      <div className="mb-8 animate-fade-in">
        <h1
          className="text-2xl tracking-wide"
          style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--ink)' }}
        >
          企業一覧
        </h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--ink-faint)' }}>
          {companies.length > 0
            ? `${companies.length}社の企業を管理中`
            : "企業を追加して就活管理を始めましょう"}
        </p>
      </div>

      {/* Search bar */}
      <form className="flex gap-3 mb-8 animate-slide-up delay-1">
        <div className="flex-1 relative">
          <svg
            className="absolute left-4 top-1/2 -translate-y-1/2"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--ink-faint)"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            name="q"
            defaultValue={q}
            placeholder="企業名・業界で検索..."
            className="form-input"
            style={{ paddingLeft: '44px' }}
          />
        </div>
        <select
          name="sort"
          defaultValue={sort}
          className="form-input"
          style={{ width: 'auto', minWidth: '140px' }}
        >
          <option value="updatedAt">更新日順</option>
          <option value="tier">Tier順</option>
        </select>
        <button type="submit" className="btn-primary">
          検索
        </button>
      </form>

      {/* Company list */}
      {companies.length === 0 ? (
        <div className="empty-state animate-fade-in delay-2">
          <div
            className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
            style={{ background: 'var(--paper-warm)', border: '1px solid var(--border-light)' }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--ink-faint)" strokeWidth="1.5" strokeLinecap="round">
              <path d="M3 21h18M9 8h1M9 12h1M9 16h1M14 8h1M14 12h1M14 16h1M5 21V5a2 2 0 012-2h10a2 2 0 012 2v16" />
            </svg>
          </div>
          <p style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', color: 'var(--ink-muted)' }}>
            企業が登録されていません
          </p>
          <p className="mt-1" style={{ fontSize: '0.8rem' }}>
            右上の「企業追加」から始めましょう
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {companies.map((c, i) => (
            <Link
              key={c.id}
              href={`/companies/${c.id}`}
              className={`company-card block animate-slide-up delay-${Math.min(i + 2, 8)}`}
            >
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-3">
                    <span
                      className="font-medium text-base truncate"
                      style={{ color: 'var(--ink)', fontWeight: 500 }}
                    >
                      {c.name}
                    </span>
                    {c.industry && (
                      <span className="tag-chip shrink-0">{c.industry}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="tier-stars">{tierLabel(c.tier)}</span>
                  <span className="stat-pill">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="9 11 12 14 22 4" />
                      <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
                    </svg>
                    {c._count.selectionSteps}
                  </span>
                  <span className="stat-pill">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="16" y1="13" x2="8" y2="13" />
                      <line x1="16" y1="17" x2="8" y2="17" />
                    </svg>
                    {c._count.logs}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
