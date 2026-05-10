import request from "supertest";
import { INestApplication } from "@nestjs/common";
import type { Server } from "http";

/**
 * Create a `supertest` client bound to the HTTP server of a Nest `INestApplication`.
 *
 * @param app - The Nest application whose underlying HTTP server will be used for requests
 * @returns A `supertest` client instance configured to send requests to the application's HTTP server
 */
export function testClient(
  app: INestApplication,
): request.SuperTest<request.Test> {
  return request(app.getHttpServer() as Server);
}

/**
 * Extracts and casts the response body to the specified type.
 *
 * @returns The response body cast to `T`.
 */
export function getBody<T>(res: request.Response): T {
  return res.body as T;
}
