import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { updateRole } from "@/lib/actions/role";
import { RoleForm } from "@/components/role-form";
import Link from "next/link";

export default async function EditRolePage({
  params,
}: {
  params: Promise<{ id: string; roleId: string }>;
}) {
  const { id, roleId } = await params;
  const [company, role] = await Promise.all([
    prisma.company.findUnique({ where: { id }, select: { name: true } }),
    prisma.role.findUnique({ where: { id: roleId } }),
  ]);
  if (!role) notFound();

  const action = updateRole.bind(null, id, roleId);

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
        <span style={{ color: 'var(--ink-light)' }}>職種を編集</span>
      </nav>
      <h1
        className="text-xl mb-8 animate-slide-up delay-1"
        style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--ink)' }}
      >
        職種を編集
      </h1>
      <div className="animate-slide-up delay-2">
        <RoleForm action={action} defaultValues={role} />
      </div>
    </div>
  );
}
