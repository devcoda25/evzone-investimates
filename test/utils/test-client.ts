import request from "supertest";
import { INestApplication } from "@nestjs/common";
import type { Server } from "http";

export function testClient(
  app: INestApplication,
): request.SuperTest<request.Test> {
  return request(app.getHttpServer() as Server);
}

export function getBody<T>(res: request.Response): T {
  return res.body as T;
}
