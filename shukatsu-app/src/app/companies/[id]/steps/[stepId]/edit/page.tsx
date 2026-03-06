import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { updateStep } from "@/lib/actions/step";
import { StepForm } from "@/components/step-form";
import Link from "next/link";

export default async function EditStepPage({
  params,
}: {
  params: Promise<{ id: string; stepId: string }>;
}) {
  const { id, stepId } = await params;
  const [company, step, roles] = await Promise.all([
    prisma.company.findUnique({ where: { id }, select: { name: true } }),
    prisma.selectionStep.findUnique({ where: { id: stepId } }),
    prisma.role.findMany({
      where: { companyId: id },
      orderBy: { name: "asc" },
    }),
  ]);
  if (!step) notFound();

  const action = updateStep.bind(null, id, stepId);

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
        <span style={{ color: 'var(--ink-light)' }}>選考ステップを編集</span>
      </nav>
      <h1
        className="text-xl mb-8 animate-slide-up delay-1"
        style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--ink)' }}
      >
        選考ステップを編集
      </h1>
      <div className="animate-slide-up delay-2">
        <StepForm action={action} roles={roles} defaultValues={step} />
      </div>
    </div>
  );
}
