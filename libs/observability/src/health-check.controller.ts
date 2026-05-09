import { Controller, Get, Query } from "@nestjs/common";
import { HealthCheckService } from "./health-check.service";

@Controller("health")
export class HealthCheckController {
  constructor(private readonly health: HealthCheckService) {}

  @Get()
  async health(@Query("check") check?: string) {
    return this.health.check(check);
  }
}