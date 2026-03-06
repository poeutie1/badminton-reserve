"use server";

import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

export async function createStep(companyId: string, formData: FormData) {
  const dateStr = formData.get("date") as string;
  await prisma.selectionStep.create({
    data: {
      companyId,
      roleId: (formData.get("roleId") as string) || null,
      stepType: formData.get("stepType") as string,
      date: dateStr ? new Date(dateStr) : new Date(),
      result: (formData.get("result") as string) || "未定",
      memo: (formData.get("memo") as string) || null,
    },
  });
  redirect(`/companies/${companyId}`);
}

export async function updateStep(
  companyId: string,
  stepId: string,
  formData: FormData
) {
  const dateStr = formData.get("date") as string;
  await prisma.selectionStep.update({
    where: { id: stepId },
    data: {
      roleId: (formData.get("roleId") as string) || null,
      stepType: formData.get("stepType") as string,
      date: dateStr ? new Date(dateStr) : new Date(),
      result: (formData.get("result") as string) || "未定",
      memo: (formData.get("memo") as string) || null,
    },
  });
  redirect(`/companies/${companyId}`);
}

export async function deleteStep(companyId: string, stepId: string) {
  await prisma.selectionStep.delete({ where: { id: stepId } });
  redirect(`/companies/${companyId}`);
}
