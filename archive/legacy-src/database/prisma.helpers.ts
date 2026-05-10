import { Decimal } from '@prisma/client/runtime/library';

export type SortOrderInput = 'ASC' | 'DESC' | undefined;

export function normalizePrisma<T>(value: T): T {
  if (value instanceof Decimal) {
    return value.toNumber() as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizePrisma(item)) as T;
  }

  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const entries = Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      normalizePrisma(item),
    ]);

    return Object.fromEntries(entries) as T;
  }

  return value;
}

export function withFullName<T extends { firstName: string; lastName: string }>(user: T): T & {
  fullName: string;
} {
  const normalized = normalizePrisma(user);

  return {
    ...normalized,
    fullName: `${normalized.firstName} ${normalized.lastName}`.trim(),
  };
}

export function withFundingProgress<T extends { fundingGoal: number; fundingRaised: number }>(
  project: T,
): T & { fundingProgress: number } {
  const normalized = normalizePrisma(project);
  const fundingGoal = Number(normalized.fundingGoal || 0);
  const fundingRaised = Number(normalized.fundingRaised || 0);

  return {
    ...normalized,
    fundingProgress:
      fundingGoal > 0 ? Math.min(Math.round((fundingRaised / fundingGoal) * 100), 100) : 0,
  };
}

export function getSortOrder(sortOrder?: SortOrderInput): 'asc' | 'desc' {
  return sortOrder === 'ASC' ? 'asc' : 'desc';
}

export function getSortField<T extends string>(
  requested: string | undefined,
  allowed: readonly T[],
  fallback: T,
): T {
  if (requested && allowed.includes(requested as T)) {
    return requested as T;
  }

  return fallback;
}

export function buildPaginationMeta(page: number, limit: number, total: number) {
  const totalPages = Math.ceil(total / limit) || 1;

  return {
    page,
    limit,
    total,
    totalPages,
    hasNextPage: page * limit < total,
    hasPrevPage: page > 1,
  };
}
