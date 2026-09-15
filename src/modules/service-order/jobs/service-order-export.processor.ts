import {
  EXPORTS_QUEUE,
  EXPORT_JOB_SERVICE_ORDER_CSV,
  toCsvBuffer,
} from '@infrastructure/exports';
import { LoggerService } from '@infrastructure/log';
import { MailService } from '@infrastructure/providers';
import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { ListServiceOrder } from '../entities';
import { ServiceOrderRepository } from '../repository';
import { ExportServiceOrderCsvFilters } from '../use-cases/export-service-order-csv.use-case';

type ExportServiceOrderCsvPayload = Readonly<{
  requestedByUserId: string;
  emailTo: string;
  nameTo?: string;
  filters: ExportServiceOrderCsvFilters;
  requestedAt: string;
}>;

export const serviceOrderTypeLabels = {
  TI: 'TI',
  MAINTENANCE: 'Manutenção',
  SYSTEM: 'Sistema',
  NETWORK: 'Rede',
  INFRASTRUCTURE: 'Infraestrutura',
  OTHER: 'Outro',
} as const;

export const serviceOrderPriorityLabels = {
  URGENT: 'Urgente',
  HIGH: 'Alta',
  MEDIUM: 'Média',
  LOW: 'Baixa',
} as const;

export const serviceOrderStatusLabels = {
  OPEN: 'Aberto',
  IN_PROGRESS: 'Em Andamento',
  CLOSED: 'Fechado',
} as const;

export const departmentLabels = {
  CONTROLADORIA_GERAL_DO_MUNICIPIO: 'Controladoria Geral do Município',
  FUNDACAO_DE_DESENVOLVIMENTO_SOCIAL_DE_BELFORD_ROXO:
    'Fundação de Desenvolvimento Social de Belford Roxo',
  FUNDACAO_SAUDE_DE_BELFORD_ROXO: 'Fundação de Saúde de Belford Roxo',
  FUNDO_MUNICIPAL_DE_SAUDE: 'Fundo Municipal de Saúde',
  GABINETE_DO_PREFEITO: 'Gabinete do Prefeito',
  GABINETE_DO_VICE_PREFEITO: 'Gabinete do Vice-Prefeito',
  INSTITUTO_DE_PREVIDENCIA_DOS_SERVIDORES_DE_BELFORD_ROXO:
    'Instituto de Previdência dos Servidores de Belford Roxo',
  PROCURADORIA_GERAL_DO_MUNICIPIO: 'Procuradoria Geral do Município',
  SECRETARIA_DE_COMBATE_A_FOME: 'Secretaria de Combate a Fome',
  SECRETARIA_MUNICIPAL_DA_CASA_CIVIL: 'Secretaria Municipal da Casa Civil',
  SECRETARIA_MUNICIPAL_DA_MULHER: 'Secretaria Municipal da Mulher',
  SECRETARIA_MUNICIPAL_DE_ACAO_COMUNITARIA:
    'Secretaria Municipal de Ação Comunitária',
  SECRETARIA_MUNICIPAL_DE_ADMINISTRACAO:
    'Secretaria Municipal de Administração',
  SECRETARIA_MUNICIPAL_DE_AGRICULTURA: 'Secretaria Municipal de Agricultura',
  SECRETARIA_MUNICIPAL_DE_ASSISTENCIA_SOCIAL_E_CIDADANIA:
    'Secretaria Municipal de Assistência Social e Cidadania',
  SECRETARIA_MUNICIPAL_DE_CIENCIA_TECNOLOGIA_E_INOVACAO:
    'Secretaria Municipal de Ciência, Tecnologia e Inovação',
  SECRETARIA_MUNICIPAL_DE_COMUNICACAO_SOCIAL:
    'Secretaria Municipal de Comunicação Social',
  SECRETARIA_MUNICIPAL_DE_CONSERVACAO: 'Secretaria Municipal de Conservação',
  SECRETARIA_MUNICIPAL_DE_CULTURA: 'Secretaria Municipal de Cultura',
  SECRETARIA_MUNICIPAL_DE_DEFESA_CIVIL: 'Secretaria Municipal de Defesa Civil',
  SECRETARIA_MUNICIPAL_DE_EDUCACAO: 'Secretaria Municipal de Educação',
  SECRETARIA_MUNICIPAL_DE_ESPORTE_E_LAZER:
    'Secretaria Municipal de Esporte e Lazer',
  SECRETARIA_MUNICIPAL_DE_FAZENDA: 'Secretaria Municipal de Fazenda',
  SECRETARIA_MUNICIPAL_DE_GOVERNO: 'Secretaria Municipal de Governo',
  SECRETARIA_MUNICIPAL_DE_HABITACAO_E_URBANISMO:
    'Secretaria Municipal de Habitação e Urbanismo',
  SECRETARIA_MUNICIPAL_DE_INDUSTRIA_E_COMERCIO:
    'Secretaria Municipal de Indústria e Comércio',
  SECRETARIA_MUNICIPAL_DE_LICITACOES_E_COMPRAS:
    'Secretaria Municipal de Licitações e Compras',
  SECRETARIA_MUNICIPAL_DE_MEIO_AMBIENTE_E_SUSTENTABILIDADE:
    'Secretaria Municipal de Meio Ambiente e Sustentabilidade',
  SECRETARIA_MUNICIPAL_DE_OBRAS_INFRAESTRUTURA_E_SANEAMENTO:
    'Secretaria Municipal de Obras, Infraestrutura e Saneamento',
  SECRETARIA_MUNICIPAL_DE_ORDEM_PUBLICA:
    'Secretaria Municipal de Ordem Pública',
  SECRETARIA_MUNICIPAL_DE_PROTECAO_E_DEFESA_DOS_ANIMAIS:
    'Secretaria Municipal de Proteção e Defesa dos Animais',
  SECRETARIA_MUNICIPAL_DE_SAUDE: 'Secretaria Municipal de Saúde',
  SECRETARIA_MUNICIPAL_DE_SEGURANCA_PUBLICA:
    'Secretaria Municipal de Segurança Pública',
  SECRETARIA_MUNICIPAL_DE_SERVICOS_PUBLICOS:
    'Secretaria Municipal de Serviços Públicos',
  SECRETARIA_MUNICIPAL_DE_TRABALHO_RENDA_E_ECONOMIA_SOLIDARIA:
    'Secretaria Municipal de Trabalho, Renda e Economia Solidária',
  SECRETARIA_MUNICIPAL_DE_TRANSPORTES_E_MOBILIDADE_URBANA:
    'Secretaria Municipal de Transportes e Mobilidade Urbana',
  SECRETARIA_MUNICIPAL_DE_TURISMO_E_EVENTOS:
    'Secretaria Municipal de Turismo e Eventos',
  SECRETARIA_MUNICIPAL_DO_IDOSO: 'Secretaria Municipal do Idoso',
  SECRETARIA_MUNICIPAL_ESPECIAL_DO_CHEFE_DE_GABINETE:
    'Secretaria Municipal Especial do Chefe de Gabinete',
} as const;

@Processor(EXPORTS_QUEUE)
export class ServiceOrderExportProcessor {
  constructor(
    private readonly serviceOrderRepository: ServiceOrderRepository,
    private readonly mailService: MailService,
    private readonly logger: LoggerService,
  ) {}

  @Process(EXPORT_JOB_SERVICE_ORDER_CSV)
  async handle(job: Job<ExportServiceOrderCsvPayload>): Promise<void> {
    const { emailTo, nameTo, filters } = job.data;

    const maxRows = Number(process.env.EXPORT_MAX_ROWS ?? 100_000);
    const batchSize = Number(process.env.EXPORT_BATCH_SIZE ?? 5_000);

    const total = await this.serviceOrderRepository.count(filters);
    const rowsToFetch = Math.min(total, maxRows);

    if (total > maxRows) {
      void this.logger.warn('Export ServiceOrder CSV truncado por maxRows', {
        total,
        maxRows,
      });
    }

    const all: ListServiceOrder[] = [];
    for (let skip = 0; skip < rowsToFetch; skip += batchSize) {
      const take = Math.min(batchSize, rowsToFetch - skip);
      const page = await this.serviceOrderRepository.findManyForExport({
        filters,
        skip,
        take,
      });
      all.push(...page);
    }

    const csvBuffer = toCsvBuffer<ListServiceOrder>(
      [
        { header: 'ID', value: (r) => r.id },
        { header: 'OS', value: (r) => r.orderId },
        { header: 'Assunto', value: (r) => r.subject },
        { header: 'Descrição', value: (r) => r.description },
        { header: 'Tipo', value: (r) => serviceOrderTypeLabels[r.type] },
        {
          header: 'Departamento',
          value: (r) => departmentLabels[r.department],
        },
        { header: 'Solicitante', value: (r) => r.requester },
        { header: 'Matrícula', value: (r) => r.registrationNumber ?? '' },
        { header: 'Telefone', value: (r) => r.contactPhone ?? '' },
        {
          header: 'Prioridade',
          value: (r) => serviceOrderPriorityLabels[r.priority],
        },
        { header: 'Status', value: (r) => serviceOrderStatusLabels[r.status] },
        {
          header: 'Técnico',
          value: (r) => r.technician?.name ?? '',
        },
        {
          header: 'Criado em',
          value: (r) => r.createdAt?.toISOString?.(),
        },
        {
          header: 'Tempo para finalizar',
          value: (r) => r.finishedTime ?? '',
        },
      ],
      all,
    );

    const fileName = `ordens-servico-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;

    await this.mailService.sendMail({
      to: emailTo,
      subject: 'Exportação de ordens de serviço (CSV)',
      template: 'export-ready',
      context: {
        name: nameTo,
        fileName,
        rows: all.length,
      },
      attachments: [
        {
          filename: fileName,
          content: csvBuffer,
          contentType: 'text/csv; charset=utf-8',
        },
      ],
    });

    void this.logger.info('Export ServiceOrder CSV enviado', {
      to: emailTo,
      rows: all.length,
    });
  }
}
