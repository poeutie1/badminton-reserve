"use server";

import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

export async function createLog(companyId: string, formData: FormData) {
  const dateStr = formData.get("date") as string;
  await prisma.log.create({
    data: {
      companyId,
      roleId: (formData.get("roleId") as string) || null,
      title: formData.get("title") as string,
      body: (formData.get("body") as string) || null,
      date: dateStr ? new Date(dateStr) : new Date(),
      tags: (formData.get("tags") as string) || null,
    },
  });
  redirect(`/companies/${companyId}`);
}

export async function updateLog(
  companyId: string,
  logId: string,
  formData: FormData
) {
  const dateStr = formData.get("date") as string;
  await prisma.log.update({
    where: { id: logId },
    data: {
      roleId: (formData.get("roleId") as string) || null,
      title: formData.get("title") as string,
      body: (formData.get("body") as string) || null,
      date: dateStr ? new Date(dateStr) : new Date(),
      tags: (formData.get("tags") as string) || null,
    },
  });
  redirect(`/companies/${companyId}`);
}

export async function deleteLog(companyId: string, logId: string) {
  await prisma.log.delete({ where: { id: logId } });
  redirect(`/companies/${companyId}`);
}
