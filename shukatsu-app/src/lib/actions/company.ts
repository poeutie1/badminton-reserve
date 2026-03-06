"use server";

import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { encrypt } from "@/lib/crypto";

export async function createCompany(formData: FormData) {
  const rawPassword = (formData.get("password") as string) || "";
  const company = await prisma.company.create({
    data: {
      name: formData.get("name") as string,
      url: (formData.get("url") as string) || null,
      industry: (formData.get("industry") as string) || null,
      tier: Number(formData.get("tier")) || 3,
      memo: (formData.get("memo") as string) || null,
      startingSalary: formData.get("startingSalary")
        ? Number(formData.get("startingSalary"))
        : null,
      salaryNote: (formData.get("salaryNote") as string) || null,
      loginUrl: (formData.get("loginUrl") as string) || null,
      loginId: (formData.get("loginId") as string) || null,
      passwordNote: (formData.get("passwordNote") as string) || null,
      encryptedPassword: rawPassword ? encrypt(rawPassword) : null,
    },
  });
  redirect(`/companies/${company.id}`);
}

export async function updateCompany(id: string, formData: FormData) {
  const rawPassword = (formData.get("password") as string) || "";
  const keepPassword = formData.get("keepPassword") === "1";

  const data: Record<string, unknown> = {
    name: formData.get("name") as string,
    url: (formData.get("url") as string) || null,
    industry: (formData.get("industry") as string) || null,
    tier: Number(formData.get("tier")) || 3,
    memo: (formData.get("memo") as string) || null,
    startingSalary: formData.get("startingSalary")
      ? Number(formData.get("startingSalary"))
      : null,
    salaryNote: (formData.get("salaryNote") as string) || null,
    loginUrl: (formData.get("loginUrl") as string) || null,
    loginId: (formData.get("loginId") as string) || null,
    passwordNote: (formData.get("passwordNote") as string) || null,
  };

  if (!keepPassword) {
    data.encryptedPassword = rawPassword ? encrypt(rawPassword) : null;
  }

  await prisma.company.update({ where: { id }, data });
  redirect(`/companies/${id}`);
}

export async function deleteCompany(id: string) {
  await prisma.company.delete({ where: { id } });
  redirect("/");
}
