import { prisma } from "@/lib/prisma";
import { createRole } from "@/lib/actions/role";
import { RoleForm } from "@/components/role-form";
import Link from "next/link";

export default async function NewRolePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const company = await prisma.company.findUnique({ where: { id }, select: { name: true } });
  const action = createRole.bind(null, id);

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
        <span style={{ color: 'var(--ink-light)' }}>職種を追加</span>
      </nav>
      <h1
        className="text-xl mb-8 animate-slide-up delay-1"
        style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--ink)' }}
      >
        職種を追加
      </h1>
      <div className="animate-slide-up delay-2">
        <RoleForm action={action} />
      </div>
    </div>
  );
}
