import { BadRequestException, NotFoundException } from '@common/filters';
import { generateId, getResolutionDuration } from '@common/utils';
import { LoggerService } from '@infrastructure/log';
import { PrismaService } from '@infrastructure/prisma';
import {
  ServiceOrderStatusEntity,
  Technician,
} from '@modules/service-order-status';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Department } from 'types/department';
import { CreateServiceOrderDTO, FindAllFilters } from '../dto';
import {
  ListServiceOrder,
  ServiceOrder,
  ServiceOrderLocationSummary,
  ServiceOrderPatrimonySummary,
  ServiceOrderReportedIssueSummary,
  ServiceOrderUserSummary,
} from '../entities';

const serviceOrderListScalarSelect = {
  patrimonyId: true,
  reportedIssueId: true,
  isExternal: true,
  contactName: true,
  contactPhone: true,
  registrationNumber: true,
  labEntryAt: true,
  labExitAt: true,
  labDescription: true,
  labTechnicianId: true,
  closedAt: true,
  closedById: true,
  serviceRating: true,
  ratedAt: true,
} as const;

const serviceOrderListSelect = {
  id: true,
  orderId: true,
  subject: true,
  description: true,
  type: true,
  status: true,
  department: true,
  priority: true,
  attachment: true,
  createdAt: true,
  requester: true,
  ...serviceOrderListScalarSelect,
  serviceOrderStatus: {
    select: {
      id: true,
      status: true,
      serviceOrderId: true,
      note: true,
      createdAt: true,
      technician: {
        select: { id: true, name: true },
      },
    },
    orderBy: { createdAt: 'desc' as const },
    take: 1,
  },
} as const;

type ServiceOrderListRecord = Prisma.ServiceOrderGetPayload<{
  select: typeof serviceOrderListSelect;
}>;

@Injectable()
export class ServiceOrderRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {}

  private buildWhere(filters: Omit<FindAllFilters, 'page' | 'limit'> = {}) {
    const { department, priority, technicianName, status, searchTerm } =
      filters;

    return {
      ...(department && { department: department as Department }),
      ...(priority && { priority }),
      ...(searchTerm && {
        OR: [
          {
            orderId: {
              contains: searchTerm,
              mode: 'insensitive' as const,
            },
          },
          {
            subject: {
              contains: searchTerm,
              mode: 'insensitive' as const,
            },
          },
          {
            requester: {
              contains: searchTerm,
              mode: 'insensitive' as const,
            },
          },
        ],
      }),
      ...(status && { status }),
      ...(technicianName
        ? {
            serviceOrderStatus: {
              some: {
                technician: {
                  name: {
                    contains: technicianName,
                    mode: 'insensitive' as const,
                  },
                },
              },
            },
          }
        : {}),
    };
  }

  private readonly select = serviceOrderListSelect;

  private mapToListServiceOrder(
    order: ServiceOrderListRecord,
  ): ListServiceOrder {
    return new ListServiceOrder(
      order.id,
      order.orderId,
      order.subject,
      order.description,
      order.type,
      order.department,
      order.requester,
      order.priority,
      order.status,
      order.createdAt,
      order.patrimonyId,
      order.reportedIssueId ?? undefined,
      order.isExternal,
      order.contactName ?? undefined,
      order.contactPhone ?? undefined,
      order.registrationNumber ?? undefined,
      order.labEntryAt ?? undefined,
      order.labExitAt ?? undefined,
      order.labDescription ?? undefined,
      order.labTechnicianId ?? undefined,
      order.closedAt ?? undefined,
      order.closedById ?? undefined,
      order.serviceRating ?? undefined,
      order.ratedAt ?? undefined,
      order.attachment ?? undefined,
      order.serviceOrderStatus?.[0]?.technician
        ? new Technician(
            order.serviceOrderStatus[0].technician.id,
            order.serviceOrderStatus[0].technician.name,
          )
        : undefined,
      order.serviceOrderStatus?.[0]?.status === 'CLOSED'
        ? getResolutionDuration(
            order.createdAt,
            order.serviceOrderStatus?.[0]?.createdAt,
          )
        : undefined,
    );
  }

  async findAll(filters: FindAllFilters = {}): Promise<{
    data: ListServiceOrder[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    try {
      const {
        page = 1,
        limit = 25,
        department,
        priority,
        technicianName,
        status,
        searchTerm,
      } = filters;

      const skip = (page - 1) * limit;

      const where = this.buildWhere({
        department,
        priority,
        technicianName,
        status,
        searchTerm,
      });

      const [data, total] = await Promise.all([
        this.prisma.serviceOrder.findMany({
          where,
          select: this.select,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.serviceOrder.count({ where }),
      ]);

      return {
        data: data.map((order) => this.mapToListServiceOrder(order)),
        total,
        page,
        totalPages: Math.ceil(total / limit),
      };
    } catch (error) {
      void this.logger.error('ServiceOrderRepository.findAll falhou', {
        error: String(error),
      });
      throw new BadRequestException(
        'Erro ao buscar ordens de serviço: ' + error.message,
      );
    }
  }

  async count(filters: Omit<FindAllFilters, 'page' | 'limit'> = {}) {
    const where = this.buildWhere(filters);
    return await this.prisma.serviceOrder.count({ where });
  }

  async findManyForExport(params: {
    filters: Omit<FindAllFilters, 'page' | 'limit'>;
    skip: number;
    take: number;
  }): Promise<ListServiceOrder[]> {
    try {
      const { filters, skip, take } = params;
      const where = this.buildWhere(filters);

      const data = await this.prisma.serviceOrder.findMany({
        where,
        select: this.select,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
      });

      return data.map((order) => this.mapToListServiceOrder(order));
    } catch (error) {
      void this.logger.error(
        'ServiceOrderRepository.findManyForExport falhou',
        {
          error: String(error),
        },
      );
      throw new BadRequestException(
        'Erro ao buscar ordens de serviço para exportação: ' + error.message,
      );
    }
  }

  async findServiceOrderByUserId(
    userId: string,
    filters: FindAllFilters = {},
  ): Promise<{
    data: ServiceOrder[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const { page = 1, limit = 25, searchTerm, status } = filters;

    const skip = (page - 1) * limit;

    const userRole = await this.prisma.user.findUnique({
      where: { id: userId, isDeleted: false, isActive: true },
      select: { role: true },
    });

    let userWhere = {};

    if (userRole?.role === 'TECHNICIAN') {
      userWhere = {
        serviceOrderStatus: {
          some: {
            technicianId: userId,
          },
        },
      };
    }

    if (userRole?.role === 'DEPARTMENT') {
      userWhere = {
        userId: userId,
      };
    }

    const where = {
      ...userWhere,
      ...(status && { status }),
      ...(searchTerm && {
        OR: [
          { orderId: { contains: searchTerm, mode: 'insensitive' as const } },
          { subject: { contains: searchTerm, mode: 'insensitive' as const } },
        ],
      }),
    };

    const select = serviceOrderListSelect;

    try {
      const [data, total] = await Promise.all([
        this.prisma.serviceOrder.findMany({
          where,
          select,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.serviceOrder.count({ where }),
      ]);

      const statusOrder = (s: string) =>
        s === 'IN_PROGRESS' ? 0 : s === 'CLOSED' ? 1 : 2;
      data.sort((a, b) => statusOrder(a.status) - statusOrder(b.status));

      return {
        data,
        total,
        page,
        totalPages: Math.ceil(total / limit),
      };
    } catch (error) {
      void this.logger.warn(
        'ServiceOrderRepository.create: usuário não encontrado',
        {
          userId,
          error: String(error),
        },
      );
      throw new BadRequestException('Erro ao buscar ordens de serviço: ');
    }
  }

  async getDashboardSummary(): Promise<{
    totalOrders: {
      total: number;
      percentage: number;
    };
    byStatus: {
      open: number;
      inProgress: number;
      closed: { total: number; percentage: number };
    };
    avgResolutionOrders: number;
    avgResolutionTime: {
      hours: number;
      percentage: number;
    };
  }> {
    const now = new Date();

    const startCurrentPeriod = new Date(now);
    startCurrentPeriod.setDate(now.getDate() - 30);

    const startPreviousPeriod = new Date(now);
    startPreviousPeriod.setDate(now.getDate() - 60);

    const currentDateFilter = { gte: startCurrentPeriod, lte: now };
    const previousDateFilter = {
      gte: startPreviousPeriod,
      lte: startCurrentPeriod,
    };

    const lastStatusInclude = {
      serviceOrderStatus: {
        orderBy: { createdAt: 'desc' as const },
        take: 1,
      },
    };

    const resolutionHistoryInclude = {
      serviceOrderStatus: {
        where: { status: { in: ['OPEN' as const, 'CLOSED' as const] } },
        orderBy: { createdAt: 'asc' as const },
      },
    };

    const [
      currentOrders,
      previousOrders,
      previousOrdersWithLastStatus,
      closedOrdersWithHistory,
      previousClosedOrdersWithHistory,
    ] = await Promise.all([
      this.prisma.serviceOrder.findMany({
        where: { createdAt: currentDateFilter },
        include: lastStatusInclude,
      }),

      this.prisma.serviceOrder.count({
        where: { createdAt: previousDateFilter },
      }),

      this.prisma.serviceOrder.findMany({
        where: { createdAt: previousDateFilter },
        include: lastStatusInclude,
      }),

      // Histórico OPEN/CLOSED para tempo médio (período atual)
      this.prisma.serviceOrder.findMany({
        where: {
          createdAt: currentDateFilter,
          serviceOrderStatus: { some: { status: 'CLOSED' } },
        },
        include: resolutionHistoryInclude,
      }),

      // Histórico OPEN/CLOSED para tempo médio (período anterior)
      this.prisma.serviceOrder.findMany({
        where: {
          createdAt: previousDateFilter,
          serviceOrderStatus: { some: { status: 'CLOSED' } },
        },
        include: resolutionHistoryInclude,
      }),
    ]);

    const calcAvgResolutionInHours = (
      orders: typeof closedOrdersWithHistory,
    ) => {
      const resolutionTimes = orders
        .map((order) => {
          const openStatus = order.serviceOrderStatus.find(
            (s) => s.status === 'OPEN',
          );
          const closedStatus = order.serviceOrderStatus.find(
            (s) => s.status === 'CLOSED',
          );

          if (!openStatus || !closedStatus) return null;

          const diffMs =
            closedStatus.createdAt.getTime() - openStatus.createdAt.getTime();
          return diffMs / (1000 * 60 * 60); // converte para horas
        })
        .filter((t): t is number => t !== null);

      if (resolutionTimes.length === 0) return 0;

      const avg =
        resolutionTimes.reduce((sum, t) => sum + t, 0) / resolutionTimes.length;
      return Number(avg.toFixed(1));
    };

    const getLastStatus = (order: {
      serviceOrderStatus: { status: string }[];
    }) => order.serviceOrderStatus[0]?.status;

    const countByStatus = (
      orders: { serviceOrderStatus: { status: string }[] }[],
      status: string,
    ) => orders.filter((o) => getLastStatus(o) === status).length;

    const currentTotal = currentOrders.length;
    const currentClosed = countByStatus(currentOrders, 'CLOSED');
    const previousTotal = previousOrdersWithLastStatus.length;
    const previousClosed = countByStatus(
      previousOrdersWithLastStatus,
      'CLOSED',
    );

    const currentResolutionRate =
      currentTotal > 0
        ? Number(((currentClosed / currentTotal) * 100).toFixed(2))
        : 0;
    const previousResolutionRate =
      previousTotal > 0
        ? Number(((previousClosed / previousTotal) * 100).toFixed(2))
        : 0;

    const currentAvgResolution = calcAvgResolutionInHours(
      closedOrdersWithHistory,
    );
    const previousAvgResolution = calcAvgResolutionInHours(
      previousClosedOrdersWithHistory,
    );

    return {
      totalOrders: {
        total: currentTotal,
        percentage: this.calculatePercentageChange(
          previousOrders,
          currentTotal,
        ),
      },
      byStatus: {
        open: countByStatus(currentOrders, 'OPEN'),
        inProgress: countByStatus(currentOrders, 'IN_PROGRESS'),
        closed: {
          total: currentClosed,
          // Trend compara taxa de resolução (fechadas/total), não o volume absoluto
          percentage: this.calculatePercentageChange(
            previousResolutionRate,
            currentResolutionRate,
          ),
        },
      },
      avgResolutionOrders: currentResolutionRate,
      avgResolutionTime: {
        hours: currentAvgResolution,
        percentage: this.calculatePercentageChange(
          previousAvgResolution,
          currentAvgResolution,
        ),
      },
    };
  }

  async getSummaryCharts(): Promise<{
    ordersByDepartment: { department: string; total: number }[];
    percentageByStatus: { status: string; percentage: number }[];
    avgResolutionTimeByDepartment: { department: string; avg: number }[];
  }> {
    const now = new Date();
    const startPeriod = new Date(now);
    startPeriod.setDate(now.getDate() - 30);

    const dateFilter = { gte: startPeriod, lte: now };

    const [ordersByDepartment, ordersWithLastStatus, closedOrdersWithHistory] =
      await Promise.all([
        this.prisma.serviceOrder.groupBy({
          by: ['department'],
          where: { createdAt: dateFilter },
          _count: { department: true },
        }),

        // 1 OS = 1 status (último registro do histórico)
        this.prisma.serviceOrder.findMany({
          where: { createdAt: dateFilter },
          select: {
            serviceOrderStatus: {
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: { status: true },
            },
          },
        }),

        this.prisma.serviceOrder.findMany({
          where: {
            createdAt: dateFilter,
            serviceOrderStatus: { some: { status: 'CLOSED' } },
          },
          select: {
            department: true,
            serviceOrderStatus: {
              where: { status: { in: ['OPEN', 'CLOSED'] } },
              orderBy: { createdAt: 'asc' },
              select: { status: true, createdAt: true },
            },
          },
        }),
      ]);

    // Calcula tempo de resolução por OS e agrupa por departamento
    const resolutionByDepartment = new Map<string, number[]>();

    for (const order of closedOrdersWithHistory) {
      const openStatus = order.serviceOrderStatus.find(
        (s) => s.status === 'OPEN',
      );
      const closedStatus = order.serviceOrderStatus.find(
        (s) => s.status === 'CLOSED',
      );

      if (!openStatus || !closedStatus) continue;

      const hours =
        (closedStatus.createdAt.getTime() - openStatus.createdAt.getTime()) /
        (1000 * 60 * 60);

      const existing = resolutionByDepartment.get(order.department) ?? [];
      resolutionByDepartment.set(order.department, [...existing, hours]);
    }

    const avgResolutionTimeByDepartment = Array.from(
      resolutionByDepartment.entries(),
    ).map(([department, times]) => ({
      department,
      avg: Number(
        (times.reduce((sum, t) => sum + t, 0) / times.length).toFixed(1),
      ),
    }));

    const statusCountMap = new Map<string, number>();
    for (const order of ordersWithLastStatus) {
      const status = order.serviceOrderStatus[0]?.status;
      if (!status) continue;
      statusCountMap.set(status, (statusCountMap.get(status) ?? 0) + 1);
    }

    const totalOrders = ordersWithLastStatus.length;

    return {
      ordersByDepartment: ordersByDepartment.map((i) => ({
        department: i.department,
        total: i._count.department,
      })),

      percentageByStatus: Array.from(statusCountMap.entries()).map(
        ([status, count]) => ({
          status,
          percentage:
            totalOrders > 0
              ? Number(((count / totalOrders) * 100).toFixed(2))
              : 0,
        }),
      ),

      avgResolutionTimeByDepartment,
    };
  }

  async findById(id: string): Promise<ServiceOrder | null> {
    try {
      const order = await this.prisma.serviceOrder.findUnique({
        where: { id },
        select: {
          ...serviceOrderListScalarSelect,
          id: true,
          orderId: true,
          subject: true,
          description: true,
          type: true,
          status: true,
          department: true,
          priority: true,
          attachment: true,
          createdAt: true,
          requester: true,
          patrimony: {
            select: {
              id: true,
              inventoryNumber: true,
              description: true,
              locationName: true,
              location: {
                select: {
                  id: true,
                  name: true,
                  address: true,
                },
              },
            },
          },
          reportedIssue: {
            select: {
              id: true,
              name: true,
            },
          },
          closedBy: {
            select: {
              id: true,
              name: true,
            },
          },
          labTechnician: {
            select: {
              id: true,
              name: true,
            },
          },
          serviceOrderStatus: {
            select: {
              id: true,
              status: true,
              serviceOrderId: true,
              note: true,
              createdAt: true,
              technician: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
            orderBy: {
              createdAt: 'desc',
            },
          },
        },
      });

      if (!order) {
        return null;
      }

      return new ServiceOrder(
        order.id,
        order.orderId,
        order.subject,
        order.description,
        order.type,
        order.department,
        order.requester,
        order.priority,
        order.status,
        order.serviceOrderStatus.map(
          (status) =>
            new ServiceOrderStatusEntity(
              status.id,
              status.serviceOrderId,
              status.status,
              status.createdAt,
              status.note ?? undefined,
              status.technician
                ? new Technician(status.technician.id, status.technician.name)
                : undefined,
            ),
        ),
        order.createdAt,
        order.patrimonyId,
        order.reportedIssueId ?? undefined,
        order.isExternal,
        order.contactName ?? undefined,
        order.contactPhone ?? undefined,
        order.registrationNumber ?? undefined,
        order.labEntryAt ?? undefined,
        order.labExitAt ?? undefined,
        order.labDescription ?? undefined,
        order.labTechnicianId ?? undefined,
        order.closedAt ?? undefined,
        order.closedById ?? undefined,
        order.serviceRating ?? undefined,
        order.ratedAt ?? undefined,
        order.attachment ?? undefined,
        order.patrimony
          ? new ServiceOrderPatrimonySummary(
              order.patrimony.id,
              order.patrimony.inventoryNumber,
              order.patrimony.description,
              order.patrimony.locationName,
              order.patrimony.location
                ? new ServiceOrderLocationSummary(
                    order.patrimony.location.id,
                    order.patrimony.location.name,
                    order.patrimony.location.address,
                  )
                : undefined,
            )
          : undefined,
        order.reportedIssue
          ? new ServiceOrderReportedIssueSummary(
              order.reportedIssue.id,
              order.reportedIssue.name,
            )
          : undefined,
        order.closedBy
          ? new ServiceOrderUserSummary(order.closedBy.id, order.closedBy.name)
          : undefined,
        order.labTechnician
          ? new ServiceOrderUserSummary(
              order.labTechnician.id,
              order.labTechnician.name,
            )
          : undefined,
      );
    } catch (error) {
      void this.logger.error('ServiceOrderRepository.findById falhou', {
        id,
        error: String(error),
      });
      throw new BadRequestException(
        'Erro ao buscar ordem de serviço: ' + error.message,
      );
    }
  }

  async create(
    dto: CreateServiceOrderDTO & {
      attachment?: string;
    },
    userId: string,
  ): Promise<void> {
    try {
      const year = new Date().getFullYear();
      const prefix = `OS-${year}-`;
      let createdOrderId = '';

      await this.prisma.$transaction(async (tx) => {
        const [result] = await tx.$queryRaw<{ max_seq: number | null }[]>`
          SELECT MAX(CAST(SPLIT_PART(order_id, '-', 3) AS INTEGER)) AS max_seq
          FROM service_order
          WHERE order_id LIKE ${prefix + '%'}
        `;

        const nextNumber = (result?.max_seq ?? 0) + 1;
        const orderId = `${prefix}${String(nextNumber).padStart(3, '0')}`;
        createdOrderId = orderId;

        const actor = await tx.user.findUnique({
          where: { id: userId },
          select: { name: true },
        });

        if (!actor) {
          throw new NotFoundException(userId + ' usuário não encontrado.');
        }

        const serviceOrder = await tx.serviceOrder.create({
          data: {
            id: generateId(),
            orderId,
            subject: dto.subject,
            description: dto.description,
            type: dto.type,
            status: 'OPEN',
            department: dto.department,
            requester: dto.requester,
            priority: dto.priority,
            attachment: dto.attachment,
            isExternal: dto.isExternal ?? false,
            contactName: dto.contactName ?? null,
            contactPhone: dto.contactPhone ?? null,
            registrationNumber: dto.registrationNumber ?? null,
            user: {
              connect: {
                id: userId,
              },
            },
            patrimony: {
              connect: { id: dto.patrimonyId },
            },
            ...(dto.reportedIssueId && {
              reportedIssue: {
                connect: { id: dto.reportedIssueId },
              },
            }),
          },
        });

        await tx.serviceOrderStatus.create({
          data: {
            id: generateId(),
            serviceOrderId: serviceOrder.id,
            status: 'OPEN',
          },
        });

        await tx.historic.create({
          data: {
            id: generateId(),
            action: 'CREATE',
            orderId: serviceOrder.id,
            detail: 'Ordem de serviço criada',
            username: actor.name,
          },
        });
      });

      void this.logger.info('Ordem de serviço criada', {
        orderId: createdOrderId,
        userId,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        const field = String(error.meta?.field_name ?? '');

        if (field.includes('patrimony')) {
          throw new NotFoundException(
            (dto.patrimonyId ?? 'Patrimônio') + ' patrimônio não encontrado.',
          );
        }

        if (
          field.includes('reported_issue') ||
          field.includes('reportedIssue')
        ) {
          throw new NotFoundException(
            (dto.reportedIssueId ?? 'Defeito') +
              ' defeito apresentado não encontrado.',
          );
        }

        void this.logger.warn(
          'ServiceOrderRepository.create: usuário não encontrado',
          {
            userId,
          },
        );
        throw new NotFoundException(userId + ' usuário não encontrado.');
      }
      void this.logger.error('ServiceOrderRepository.create falhou', {
        userId,
        error: String(error),
      });
      throw new BadRequestException(
        'Erro ao criar status da ordem de serviço: ' + error.message,
      );
    }
  }

  async findForPdf(id: string): Promise<{
    orderId: string;
    subject: string;
    description: string;
    type: string;
    department: string;
    requester: string;
    priority: string;
    isExternal: boolean;
    contactName: string | null;
    contactPhone: string | null;
    registrationNumber: string | null;
    labDescription: string | null;
    createdAt: Date;
    patrimony: {
      inventoryNumber: string;
      description: string;
      department: string;
      locationName: string | null;
      patrimonyTypeName: string | null;
      location: { name: string; address: string | null } | null;
    } | null;
    reportedIssue: { name: string } | null;
    closedBy: { name: string } | null;
    labTechnician: { name: string } | null;
    serviceOrderStatus: {
      status: string;
      createdAt: Date;
      technician: { name: string } | null;
    }[];
  } | null> {
    const order = await this.prisma.serviceOrder.findUnique({
      where: { id },
      select: {
        orderId: true,
        subject: true,
        description: true,
        type: true,
        department: true,
        requester: true,
        priority: true,
        isExternal: true,
        contactName: true,
        contactPhone: true,
        registrationNumber: true,
        labDescription: true,
        createdAt: true,
        patrimony: {
          select: {
            inventoryNumber: true,
            description: true,
            department: true,
            locationName: true,
            patrimonyType: { select: { name: true } },
            location: { select: { name: true, address: true } },
          },
        },
        reportedIssue: { select: { name: true } },
        closedBy: { select: { name: true } },
        labTechnician: { select: { name: true } },
        serviceOrderStatus: {
          select: {
            status: true,
            createdAt: true,
            technician: { select: { name: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!order) {
      return null;
    }

    return {
      orderId: order.orderId,
      subject: order.subject,
      description: order.description,
      type: order.type,
      department: order.department,
      requester: order.requester,
      priority: order.priority,
      isExternal: order.isExternal,
      contactName: order.contactName,
      contactPhone: order.contactPhone,
      registrationNumber: order.registrationNumber,
      labDescription: order.labDescription,
      createdAt: order.createdAt,
      patrimony: order.patrimony
        ? {
            inventoryNumber: order.patrimony.inventoryNumber,
            description: order.patrimony.description,
            department: order.patrimony.department,
            locationName: order.patrimony.locationName,
            patrimonyTypeName: order.patrimony.patrimonyType?.name ?? null,
            location: order.patrimony.location
              ? {
                  name: order.patrimony.location.name,
                  address: order.patrimony.location.address,
                }
              : null,
          }
        : null,
      reportedIssue: order.reportedIssue,
      closedBy: order.closedBy,
      labTechnician: order.labTechnician,
      serviceOrderStatus: order.serviceOrderStatus.map((s) => ({
        status: s.status,
        createdAt: s.createdAt,
        technician: s.technician,
      })),
    };
  }

  private calculatePercentageChange(previous: number, current: number): number {
    if (previous === 0) return current > 0 ? 100 : 0;
    return Math.round(Number(((current - previous) / previous) * 100));
  }
}
