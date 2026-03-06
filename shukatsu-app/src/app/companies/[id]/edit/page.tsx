import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { updateCompany } from "@/lib/actions/company";
import { CompanyForm } from "@/components/company-form";
import { decrypt } from "@/lib/crypto";
import Link from "next/link";

export default async function EditCompanyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const company = await prisma.company.findUnique({ where: { id } });
  if (!company) notFound();

  const updateWithId = updateCompany.bind(null, id);
  const decryptedPassword = company.encryptedPassword
    ? decrypt(company.encryptedPassword)
    : undefined;

  return (
    <div>
      <nav className="mb-6 animate-fade-in" style={{ fontSize: '0.8rem', color: 'var(--ink-faint)' }}>
        <Link href="/" className="hover:underline" style={{ color: 'var(--ink-muted)' }}>
          企業一覧
        </Link>
        <span className="mx-2">/</span>
        <Link href={`/companies/${id}`} className="hover:underline" style={{ color: 'var(--ink-muted)' }}>
          {company.name}
        </Link>
        <span className="mx-2">/</span>
        <span style={{ color: 'var(--ink-light)' }}>編集</span>
      </nav>
      <h1
        className="text-xl mb-8 animate-slide-up delay-1"
        style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--ink)' }}
      >
        企業を編集
      </h1>
      <div className="animate-slide-up delay-2">
        <CompanyForm
          action={updateWithId}
          defaultValues={company}
          decryptedPassword={decryptedPassword}
        />
      </div>
    </div>
  );
}
