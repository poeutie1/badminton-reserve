import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import { formatDate, tierLabel, resultBadgeClass } from "@/lib/utils";
import { deleteCompany } from "@/lib/actions/company";
import { deleteRole } from "@/lib/actions/role";
import { deleteStep } from "@/lib/actions/step";
import { deleteLog } from "@/lib/actions/log";
import { DeleteButton } from "@/components/delete-button";
import { PasswordReveal } from "@/components/password-reveal";
import { decrypt } from "@/lib/crypto";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function CompanyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { id } = await params;
  const company = await prisma.company.findUnique({
    where: { id, userId: session.user.id },
    include: {
      roles: { orderBy: { createdAt: "desc" } },
      selectionSteps: {
        orderBy: { date: "desc" },
        include: { role: true },
      },
      logs: { orderBy: { date: "desc" } },
    },
  });

  if (!company) notFound();

  return (
    <div className="space-y-8">
      {/* Breadcrumb */}
      <nav className="animate-fade-in" style={{ fontSize: '0.8rem', color: 'var(--ink-faint)' }}>
        <Link href="/" className="hover:underline" style={{ color: 'var(--ink-muted)' }}>
          企業一覧
        </Link>
        <span className="mx-2">/</span>
        <span style={{ color: 'var(--ink-light)' }}>{company.name}</span>
      </nav>

      {/* Header */}
      <div className="flex items-start justify-between animate-slide-up delay-1">
        <div>
          <h1
            className="text-2xl tracking-wide"
            style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--ink)' }}
          >
            {company.name}
          </h1>
          <div className="flex flex-wrap items-center gap-3 mt-2">
            {company.industry && (
              <span className="tag-chip">{company.industry}</span>
            )}
            <span className="tier-stars">{tierLabel(company.tier)}</span>
            {company.startingSalary && (
              <span className="stat-pill">
                初任給 {company.startingSalary}万円
              </span>
            )}
          </div>
          {company.url && (
            <a
              href={company.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 mt-3 text-sm hover:underline"
              style={{ color: 'var(--indigo)' }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" />
              </svg>
              {company.url}
            </a>
          )}
          {company.memo && (
            <p
              className="mt-3 whitespace-pre-wrap leading-relaxed"
              style={{ fontSize: '0.875rem', color: 'var(--ink-muted)' }}
            >
              {company.memo}
            </p>
          )}
        </div>
        <div className="flex gap-2 shrink-0">
          <Link
            href={`/companies/${id}/edit`}
            className="btn-ghost"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
            編集
          </Link>
          <DeleteButton
            action={deleteCompany.bind(null, id)}
            label="削除"
            confirm="この企業を削除しますか？関連データもすべて削除されます。"
          />
        </div>
      </div>

      {/* Login Info */}
      {(company.loginUrl || company.loginId || company.encryptedPassword) && (
        <div className="info-box animate-slide-up delay-2">
          <h3
            className="text-sm mb-3"
            style={{ fontFamily: 'var(--font-display)', fontWeight: 600, color: 'var(--ink-light)' }}
          >
            ログイン情報
          </h3>
          <div className="space-y-1.5" style={{ fontSize: '0.85rem' }}>
            {company.loginUrl && (
              <p>
                <span style={{ color: 'var(--ink-faint)' }}>URL: </span>
                <a
                  href={company.loginUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline"
                  style={{ color: 'var(--indigo)' }}
                >
                  {company.loginUrl}
                </a>
              </p>
            )}
            {company.loginId && (
              <p>
                <span style={{ color: 'var(--ink-faint)' }}>ID: </span>
                <span style={{ color: 'var(--ink)' }}>{company.loginId}</span>
              </p>
            )}
            {company.encryptedPassword && (
              <p>
                <span style={{ color: 'var(--ink-faint)' }}>PW: </span>
                <PasswordReveal password={decrypt(company.encryptedPassword)} />
              </p>
            )}
            {company.passwordNote && (
              <p>
                <span style={{ color: 'var(--ink-faint)' }}>メモ: </span>
                <span style={{ color: 'var(--ink-muted)' }}>{company.passwordNote}</span>
              </p>
            )}
          </div>
        </div>
      )}

      {/* Roles */}
      <section className="section-card animate-slide-up delay-3">
        <div className="flex items-center justify-between mb-5">
          <h2
            className="text-lg tracking-wide"
            style={{ fontFamily: 'var(--font-display)', fontWeight: 600, color: 'var(--ink)' }}
          >
            職種
          </h2>
          <Link
            href={`/companies/${id}/roles/new`}
            className="inline-flex items-center gap-1 text-sm font-medium hover:underline"
            style={{ color: 'var(--vermillion)' }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            追加
          </Link>
        </div>
        {company.roles.length === 0 ? (
          <p style={{ fontSize: '0.85rem', color: 'var(--ink-faint)' }}>
            まだ登録されていません
          </p>
        ) : (
          <div className="space-y-1">
            {company.roles.map((role) => (
              <div key={role.id} className="item-row flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="font-medium" style={{ fontSize: '0.9rem' }}>
                    {role.name}
                  </span>
                  {role.location && (
                    <span className="stat-pill">{role.location}</span>
                  )}
                  {role.salaryRange && (
                    <span className="stat-pill">{role.salaryRange}</span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <Link
                    href={`/companies/${id}/roles/${role.id}/edit`}
                    className="text-sm hover:underline"
                    style={{ color: 'var(--ink-faint)' }}
                  >
                    編集
                  </Link>
                  <DeleteButton
                    action={deleteRole.bind(null, id, role.id)}
                    label="削除"
                    confirm="この職種を削除しますか？"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Selection Steps */}
      <section className="section-card animate-slide-up delay-4">
        <div className="flex items-center justify-between mb-5">
          <h2
            className="text-lg tracking-wide"
            style={{ fontFamily: 'var(--font-display)', fontWeight: 600, color: 'var(--ink)' }}
          >
            選考ステップ
          </h2>
          <Link
            href={`/companies/${id}/steps/new`}
            className="inline-flex items-center gap-1 text-sm font-medium hover:underline"
            style={{ color: 'var(--vermillion)' }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            追加
          </Link>
        </div>
        {company.selectionSteps.length === 0 ? (
          <p style={{ fontSize: '0.85rem', color: 'var(--ink-faint)' }}>
            まだ登録されていません
          </p>
        ) : (
          <div className="space-y-1">
            {company.selectionSteps.map((step) => (
              <div key={step.id} className="item-row flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span style={{ fontSize: '0.8rem', color: 'var(--ink-faint)', minWidth: '80px' }}>
                    {formatDate(step.date)}
                  </span>
                  <span
                    className="font-medium"
                    style={{ fontSize: '0.9rem', color: 'var(--ink)' }}
                  >
                    {step.stepType}
                  </span>
                  {step.role && (
                    <span className="tag-chip">{step.role.name}</span>
                  )}
                  <span className={`badge ${resultBadgeClass(step.result)}`}>
                    {step.result}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <Link
                    href={`/companies/${id}/steps/${step.id}/edit`}
                    className="text-sm hover:underline"
                    style={{ color: 'var(--ink-faint)' }}
                  >
                    編集
                  </Link>
                  <DeleteButton
                    action={deleteStep.bind(null, id, step.id)}
                    label="削除"
                    confirm="このステップを削除しますか？"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Logs */}
      <section className="section-card animate-slide-up delay-5">
        <div className="flex items-center justify-between mb-5">
          <h2
            className="text-lg tracking-wide"
            style={{ fontFamily: 'var(--font-display)', fontWeight: 600, color: 'var(--ink)' }}
          >
            ログ
          </h2>
          <Link
            href={`/companies/${id}/logs/new`}
            className="inline-flex items-center gap-1 text-sm font-medium hover:underline"
            style={{ color: 'var(--vermillion)' }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            追加
          </Link>
        </div>
        {company.logs.length === 0 ? (
          <p style={{ fontSize: '0.85rem', color: 'var(--ink-faint)' }}>
            まだ登録されていません
          </p>
        ) : (
          <div className="space-y-1">
            {company.logs.map((log) => (
              <div key={log.id} className="item-row">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span style={{ fontSize: '0.8rem', color: 'var(--ink-faint)', minWidth: '80px' }}>
                      {formatDate(log.date)}
                    </span>
                    <span
                      className="font-medium"
                      style={{ fontSize: '0.9rem', color: 'var(--ink)' }}
                    >
                      {log.title}
                    </span>
                    {log.tags && (
                      <div className="flex gap-1">
                        {log.tags.split(",").map((tag) => (
                          <span key={tag.trim()} className="tag-chip">
                            {tag.trim()}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <Link
                      href={`/companies/${id}/logs/${log.id}/edit`}
                      className="text-sm hover:underline"
                      style={{ color: 'var(--ink-faint)' }}
                    >
                      編集
                    </Link>
                    <DeleteButton
                      action={deleteLog.bind(null, id, log.id)}
                      label="削除"
                      confirm="このログを削除しますか？"
                    />
                  </div>
                </div>
                {log.body && (
                  <p
                    className="mt-2 ml-[92px] whitespace-pre-wrap leading-relaxed"
                    style={{ fontSize: '0.85rem', color: 'var(--ink-muted)' }}
                  >
                    {log.body}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
