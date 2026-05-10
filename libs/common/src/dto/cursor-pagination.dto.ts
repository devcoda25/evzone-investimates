import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsOptional, IsString } from "class-validator";

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

/**
 * Encode a string, number, or Date into a base64url cursor string.
 *
 * @param value - The value to encode; if a `Date` is provided, its ISO 8601 string is encoded.
 * @returns A base64url-encoded string representing the provided `value`.
 */
export function encodeCursor(value: string | Date | number): string {
  if (value instanceof Date) return Buffer.from(value.toISOString()).toString("base64url");
  return Buffer.from(String(value)).toString("base64url");
}

/**
 * Decodes a base64url-encoded pagination cursor into its original UTF-8 string.
 *
 * @param cursor - The base64url-encoded cursor value.
 * @returns The decoded cursor as a UTF-8 string.
 */
export function decodeCursor(cursor: string): string {
  return Buffer.from(cursor, "base64url").toString("utf8");
}

/**
 * Build cursor pagination metadata for an ordered list of items that include an `id` string.
 *
 * @param items - Items already ordered according to the requested sort; each item must have an `id` string.
 * @param limit - Maximum number of items per page used to determine if a next page exists.
 * @param _sortBy - Name of the field used for ordering (unused by this helper; provided for API parity).
 * @param _sortOrder - Sort direction (`"asc"` or `"desc"`, unused by this helper; provided for API parity).
 * @returns Pagination metadata including `limit`, `nextCursor` (base64url-encoded `id` of the last item when a next page exists, otherwise `null`), `prevCursor` (`null`), `hasNextPage`, and `hasPrevPage` (`false`).
 */
export function toCursorPaginationMeta<T extends { id: string }>(
  items: T[],
  limit: number,
  _sortBy: string,
  _sortOrder: CursorSortOrder,
): CursorPaginationMeta {
  const hasNextPage = items.length > limit;
  const data = hasNextPage ? items.slice(0, limit) : items;
  const nextCursor = hasNextPage && data.length > 0 ? encodeCursor(data[data.length - 1].id) : null;
  return {
    limit,
    nextCursor,
    prevCursor: null,
    hasNextPage,
    hasPrevPage: false,
  };
}
