import {
  ServiceOrderStatusEntity,
  Technician,
} from '@modules/service-order-status';
import { Department } from 'types/department';
import {
  ServiceOrderPriority,
  ServiceOrderStatus,
  ServiceOrderType,
} from 'types/service-order';

export class ServiceOrderLocationSummary {
  constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly address?: string | null,
  ) {}
}

export class ServiceOrderPatrimonySummary {
  constructor(
    public readonly id: string,
    public readonly inventoryNumber: string,
    public readonly description: string,
    public readonly locationName?: string | null,
    public readonly location?: ServiceOrderLocationSummary,
  ) {}
}

export class ServiceOrderReportedIssueSummary {
  constructor(
    public readonly id: string,
    public readonly name: string,
  ) {}
}

export class ServiceOrderUserSummary {
  constructor(
    public readonly id: string,
    public readonly name: string,
  ) {}
}

export class ServiceOrder {
  constructor(
    public readonly id: string,
    public readonly orderId: string,
    public readonly subject: string,
    public readonly description: string,
    public readonly type: ServiceOrderType,
    public readonly department: Department,
    public readonly requester: string,
    public readonly priority: ServiceOrderPriority,
    public readonly status: ServiceOrderStatus,
    public readonly serviceOrderStatus: ServiceOrderStatusEntity[],
    public readonly createdAt: Date,
    public readonly patrimonyId: string,
    public readonly reportedIssueId?: string,
    public readonly isExternal?: boolean,
    public readonly contactName?: string,
    public readonly contactPhone?: string,
    public readonly registrationNumber?: string,
    public readonly labEntryAt?: Date,
    public readonly labExitAt?: Date,
    public readonly labDescription?: string,
    public readonly labTechnicianId?: string,
    public readonly closedAt?: Date,
    public readonly closedById?: string,
    public readonly serviceRating?: number,
    public readonly ratedAt?: Date,
    public readonly attachment?: string,
    public readonly patrimony?: ServiceOrderPatrimonySummary,
    public readonly reportedIssue?: ServiceOrderReportedIssueSummary,
    public readonly closedBy?: ServiceOrderUserSummary,
    public readonly labTechnician?: ServiceOrderUserSummary,
  ) {}
}

export class ListServiceOrder {
  constructor(
    public readonly id: string,
    public readonly orderId: string,
    public readonly subject: string,
    public readonly description: string,
    public readonly type: ServiceOrderType,
    public readonly department: Department,
    public readonly requester: string,
    public readonly priority: ServiceOrderPriority,
    public readonly status: ServiceOrderStatus,
    public readonly createdAt: Date,
    public readonly patrimonyId: string,
    public readonly reportedIssueId?: string,
    public readonly isExternal?: boolean,
    public readonly contactName?: string,
    public readonly contactPhone?: string,
    public readonly registrationNumber?: string,
    public readonly labEntryAt?: Date,
    public readonly labExitAt?: Date,
    public readonly labDescription?: string,
    public readonly labTechnicianId?: string,
    public readonly closedAt?: Date,
    public readonly closedById?: string,
    public readonly serviceRating?: number,
    public readonly ratedAt?: Date,
    public readonly attachment?: string,
    public readonly technician?: Technician,
    public readonly finishedTime?: string,
  ) {}
}
