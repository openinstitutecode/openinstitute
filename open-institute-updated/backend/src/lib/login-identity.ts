import type { Prisma } from "@prisma/client";

export function loginIdentityWhere(identity: string): Prisma.UserWhereInput {
  const value = identity.trim();
  if (value.includes("@")) {
    return { email: { equals: value, mode: "insensitive" } };
  }

  return {
    student: {
      is: {
        OR: [
          { studentNumber: { equals: value, mode: "insensitive" } },
          { admissionNumber: { equals: value, mode: "insensitive" } },
        ],
      },
    },
  };
}
