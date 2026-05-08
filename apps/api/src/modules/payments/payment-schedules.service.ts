import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "@evzone/database";
import { AuthenticatedUser } from "@evzone/common";

export interface PaymentScheduleResponse {
  id: string;
  dealName: string;
  projectId: string;
  amount: string;
  currency: string;
  dueDate: Date;
  status: string;
  type: string;
  description: string | null;
  paymentNumber: number | null;
  totalPayments: number | null;
}

@Injectable()
export class PaymentSchedulesService {
  constructor(private readonly prisma: PrismaService) {}

  async findByUser(user: AuthenticatedUser): Promise<PaymentScheduleResponse[]> {
    const schedules = await this.prisma.paymentSchedule.findMany({
      where: { userId: user.id },
      orderBy: { dueDate: "asc" },
    });

    return Promise.all(
      schedules.map(async (schedule) => {
        let dealName = "Unknown Deal";
        if (schedule.dealId) {
          const deal = await this.prisma.deal.findUnique({
            where: { id: schedule.dealId },
            select: { title: true },
          });
          if (deal) dealName = deal.title;
        } else if (schedule.projectId) {
          const project = await this.prisma.project.findUnique({
            where: { id: schedule.projectId },
            select: { title: true },
          });
          if (project) dealName = project.title;
        }

        return {
          id: schedule.id,
          dealName,
          projectId: schedule.projectId ?? "",
          amount: schedule.amount.toString(),
          currency: schedule.currency,
          dueDate: schedule.dueDate,
          status: schedule.status,
          type: schedule.type,
          description: schedule.description,
          paymentNumber: null,
          totalPayments: null,
        };
      }),
    );
  }

  async findById(id: string, user: AuthenticatedUser): Promise<PaymentScheduleResponse> {
    const schedule = await this.prisma.paymentSchedule.findFirst({
      where: { id, userId: user.id },
    });
    if (!schedule) throw new NotFoundException("Payment schedule not found");

    let dealName = "Unknown Deal";
    if (schedule.dealId) {
      const deal = await this.prisma.deal.findUnique({
        where: { id: schedule.dealId },
        select: { title: true },
      });
      if (deal) dealName = deal.title;
    } else if (schedule.projectId) {
      const project = await this.prisma.project.findUnique({
        where: { id: schedule.projectId },
        select: { title: true },
      });
      if (project) dealName = project.title;
    }

    return {
      id: schedule.id,
      dealName,
      projectId: schedule.projectId ?? "",
      amount: schedule.amount.toString(),
      currency: schedule.currency,
      dueDate: schedule.dueDate,
      status: schedule.status,
      type: schedule.type,
      description: schedule.description,
      paymentNumber: null,
      totalPayments: null,
    };
  }
}
