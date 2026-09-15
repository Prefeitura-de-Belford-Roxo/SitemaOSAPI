import { BadRequestException, NotFoundException } from '@common/filters';
import { Inject, Injectable } from '@nestjs/common';
import { Department } from 'types/department';
import { ServiceOrderPriority, ServiceOrderType } from 'types/service-order';
import {
  departmentLabels,
  serviceOrderPriorityLabels,
  serviceOrderTypeLabels,
} from '../jobs/service-order-export.processor';
import {
  ServiceOrderPdfData,
  ServiceOrderPdfGenerator,
} from '../pdf/service-order-pdf.generator';
import { ServiceOrderRepository } from '../repository';

const pdfStatusLabels: Record<string, string> = {
  OPEN: 'Aberto',
  IN_PROGRESS: 'Em Andamento',
  IN_LABORATORY: 'Em Laboratório',
  LAB_COMPLETED: 'Laboratório Concluído',
  CLOSED: 'Finalizada',
  CANCELLED: 'Cancelado',
};

export type ExportServiceOrderPdfResult = Readonly<{
  buffer: Buffer;
  fileName: string;
}>;

@Injectable()
export class ExportServiceOrderPdfUseCase {
  constructor(
    @Inject('ServiceOrderRepository')
    private readonly serviceOrderRepository: ServiceOrderRepository,
    private readonly pdfGenerator: ServiceOrderPdfGenerator,
  ) {}

  async execute(id: string): Promise<ExportServiceOrderPdfResult> {
    const order = await this.serviceOrderRepository.findForPdf(id);

    if (!order) {
      throw new NotFoundException('Ordem de serviço não encontrada');
    }

    const lastStatus = order.serviceOrderStatus[0];

    if (!lastStatus || lastStatus.status !== 'CLOSED') {
      throw new BadRequestException(
        'O PDF só pode ser gerado para ordens de serviço finalizadas',
      );
    }

    const openStatus = order.serviceOrderStatus.find((s) => s.status === 'OPEN');
    const openedAt = openStatus?.createdAt ?? order.createdAt;

    const responsibleTechnician =
      order.serviceOrderStatus.find((s) => s.technician?.name)?.technician
        ?.name ??
      order.closedBy?.name ??
      'Não atribuído';

    const department =
      (order.patrimony?.department as Department | undefined) ??
      order.department;

    const data: ServiceOrderPdfData = {
      orderId: order.orderId,
      openedAt,
      requester: order.requester,
      contactName: order.contactName,
      contactPhone: order.contactPhone,
      registrationNumber: order.registrationNumber,
      isExternal: order.isExternal,
      typeLabel:
        serviceOrderTypeLabels[order.type as ServiceOrderType] ?? order.type,
      priorityLabel:
        serviceOrderPriorityLabels[order.priority as ServiceOrderPriority] ??
        order.priority,
      statusLabel: pdfStatusLabels[lastStatus.status] ?? lastStatus.status,
      patrimonyInventoryNumber:
        order.patrimony?.inventoryNumber ?? 'Não cadastrado',
      patrimonyTypeName:
        order.patrimony?.patrimonyTypeName ?? 'Não cadastrado',
      patrimonyDescription:
        order.patrimony?.description ?? 'Não cadastrado',
      departmentLabel: departmentLabels[department] ?? department,
      locationName:
        order.patrimony?.locationName ??
        order.patrimony?.location?.name ??
        'Não cadastrado',
      locationAddress:
        order.patrimony?.location?.address ?? 'Não cadastrado',
      defectType: order.reportedIssue?.name ?? 'Não cadastrado',
      defectDescription: order.subject,
      serviceDescription: order.description,
      responsibleTechnician,
      labDescription: order.labDescription,
      labTechnicianName: order.labTechnician?.name ?? null,
    };

    const buffer = await this.pdfGenerator.generate(data);
    const safeOrderId = order.orderId.replace(/[^\w.-]+/g, '_');

    return {
      buffer,
      fileName: `OS-${safeOrderId}.pdf`,
    };
  }
}
