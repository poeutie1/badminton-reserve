import { prisma } from "@/lib/prisma";
import { createStep } from "@/lib/actions/step";
import { StepForm } from "@/components/step-form";
import Link from "next/link";

export default async function NewStepPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [company, roles] = await Promise.all([
    prisma.company.findUnique({ where: { id }, select: { name: true } }),
    prisma.role.findMany({
      where: { companyId: id },
      orderBy: { name: "asc" },
    }),
  ]);
  const action = createStep.bind(null, id);

  return (
    <div>
      <nav className="mb-6 animate-fade-in" style={{ fontSize: '0.8rem', color: 'var(--ink-faint)' }}>
        <Link href="/" className="hover:underline" style={{ color: 'var(--ink-muted)' }}>
          企業一覧
        </Link>
        <span className="mx-2">/</span>
        <Link href={`/companies/${id}`} className="hover:underline" style={{ color: 'var(--ink-muted)' }}>
          {company?.name}
        </Link>
        <span className="mx-2">/</span>
        <span style={{ color: 'var(--ink-light)' }}>選考ステップを追加</span>
      </nav>
      <h1
        className="text-xl mb-8 animate-slide-up delay-1"
        style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--ink)' }}
      >
        選考ステップを追加
      </h1>
      <div className="animate-slide-up delay-2">
        <StepForm action={action} roles={roles} />
      </div>
    </div>
  );
}
