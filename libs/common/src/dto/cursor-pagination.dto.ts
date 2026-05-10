import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import { Type } from "class-transformer";

export type CursorSortOrder = "asc" | "desc";

export class CursorPaginationDto {
  @ApiPropertyOptional({
    description: "Opaque cursor for pagination. Omit for first page.",
  })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number = 20;

  @ApiPropertyOptional({ default: "createdAt" })
  @IsOptional()
  @IsString()
  sortBy?: string = "createdAt";

  @ApiPropertyOptional({ enum: ["asc", "desc"], default: "desc" })
  @IsOptional()
  @IsIn(["asc", "desc"])
  sortOrder?: CursorSortOrder = "desc";
}

export interface CursorPaginationMeta {
  limit: number;
  nextCursor: string | null;
  prevCursor: string | null;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export interface CursorPaginatedResponse<T> {
  data: T[];
  meta: CursorPaginationMeta;
}

export function encodeCursor(value: string | Date | number): string {
  if (value instanceof Date) return Buffer.from(value.toISOString()).toString("base64url");
  return Buffer.from(String(value)).toString("base64url");
}

export function decodeCursor(cursor: string): string {
  return Buffer.from(cursor, "base64url").toString("utf8");
}

export function toCursorPaginationMeta<T extends { id: string }>(
  items: T[],
  limit: number,
  sortBy: string,
  sortOrder: CursorSortOrder,
): CursorPaginationMeta {
  const hasNextPage = items.length > limit;
  const data = hasNextPage ? items.slice(0, limit) : items;
  const lastItem = data[data.length - 1];
  const nextCursor = hasNextPage && lastItem
    ? encodeCursor(JSON.stringify({ sortValue: (lastItem as Record<string, unknown>)[sortBy], id: lastItem.id, sortOrder }))
    : null;
  return {
    limit,
    nextCursor,
    prevCursor: null,
    hasNextPage,
    hasPrevPage: false,
  };
}
