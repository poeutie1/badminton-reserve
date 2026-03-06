"use server";

import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

export async function createRole(companyId: string, formData: FormData) {
  await prisma.role.create({
    data: {
      companyId,
      name: formData.get("name") as string,
      location: (formData.get("location") as string) || null,
      salaryRange: (formData.get("salaryRange") as string) || null,
      memo: (formData.get("memo") as string) || null,
    },
  });
  redirect(`/companies/${companyId}`);
}

export async function updateRole(
  companyId: string,
  roleId: string,
  formData: FormData
) {
  await prisma.role.update({
    where: { id: roleId },
    data: {
      name: formData.get("name") as string,
      location: (formData.get("location") as string) || null,
      salaryRange: (formData.get("salaryRange") as string) || null,
      memo: (formData.get("memo") as string) || null,
    },
  });
  redirect(`/companies/${companyId}`);
}

export async function deleteRole(companyId: string, roleId: string) {
  await prisma.role.delete({ where: { id: roleId } });
  redirect(`/companies/${companyId}`);
}
