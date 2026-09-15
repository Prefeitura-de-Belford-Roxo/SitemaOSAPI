import { Injectable } from '@nestjs/common';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import PDFDocument from 'pdfkit';

export type ServiceOrderPdfData = {
  orderId: string;
  openedAt: Date;
  requester: string;
  contactName: string | null;
  contactPhone: string | null;
  registrationNumber: string | null;
  isExternal: boolean;
  typeLabel: string;
  priorityLabel: string;
  statusLabel: string;
  patrimonyInventoryNumber: string;
  patrimonyTypeName: string;
  patrimonyDescription: string;
  departmentLabel: string;
  locationName: string;
  locationAddress: string;
  defectType: string;
  defectDescription: string;
  serviceDescription: string;
  responsibleTechnician: string;
  labDescription: string | null;
  labTechnicianName: string | null;
};

const NOT_REGISTERED = 'Não cadastrado';

const PAGE = { width: 595.28, height: 841.89 };
const MARGIN_X = 34;
const CONTENT_WIDTH = PAGE.width - MARGIN_X * 2; // ~527.28
const CELL_PAD_LEFT = 8;
const CELL_PAD_RIGHT = 3;

function formatDateTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function orNa(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : NOT_REGISTERED;
}

/** Ex.: (21)98999-9370 → (21) 98999-9370 */
function formatPhone(value: string | null | undefined): string {
  if (!value?.trim()) return NOT_REGISTERED;
  const digits = value.replace(/\D/g, '');
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return value.replace(/\)(\d)/, ') $1').trim();
}

type Cell = { label: string; value: string; width: number };

@Injectable()
export class ServiceOrderPdfGenerator {
  async generate(data: ServiceOrderPdfData): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 0,
        info: {
          Title: `OS ${data.orderId}`,
          Author: 'Sistema de Ordem de Serviço',
        },
      });

      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      let y = this.drawHeader(doc);

      y = this.drawOrderHeaderTable(doc, data, y + 8);
      y = this.drawUserContactTable(doc, data, y);

      y = this.drawCenteredSectionTitle(doc, 'Dados do Patrimônio', y + 14);
      y = this.drawPatrimonyBlock(doc, data, y + 6);

      y = this.drawCenteredSectionTitle(doc, 'Dados do Defeito', y + 14);
      y = this.drawDefectBlock(doc, data, y + 6);

      this.drawSignatures(doc);

      doc.end();
    });
  }

  private resolveAsset(fileName: string): string | null {
    const candidates = [
      join(__dirname, 'assets', fileName),
      join(process.cwd(), 'src/modules/service-order/pdf/assets', fileName),
      join(process.cwd(), 'dist/modules/service-order/pdf/assets', fileName),
      join(process.cwd(), 'assets/pdf', fileName),
    ];
    return candidates.find((p) => existsSync(p)) ?? null;
  }

  private drawHeader(doc: PDFKit.PDFDocument): number {
    const logoRight = this.resolveAsset('logo-prefeitura.png');
    const logoW = 78;
    const logoH = 46;
    const logoY = 28;
    const logoX = PAGE.width - MARGIN_X - logoW;

    if (logoRight) {
      doc.image(logoRight, logoX, logoY, {
        width: logoW,
        height: logoH,
      });
    }

    const titleX = MARGIN_X;
    const titleWidth = logoX - titleX - 10;
    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor('#000000')
      .text('PREFEITURA MUNICIPAL DE BELFORD ROXO', titleX, 38, {
        width: titleWidth,
        align: 'left',
        lineBreak: false,
      });
    doc.text('SISTEMA DE ORDEM DE SERVIÇO', titleX, 52, {
      width: titleWidth,
      align: 'left',
      lineBreak: false,
    });
    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .text(
        'SECRETARIA MUNICIPAL DE CIÊNCIA E TECNOLOGIA E INOVAÇÃO - SMCTI',
        titleX,
        66,
        { width: titleWidth, align: 'left', lineBreak: false },
      );

    return 92;
  }

  private drawOrderHeaderTable(
    doc: PDFKit.PDFDocument,
    data: ServiceOrderPdfData,
    y: number,
  ): number {
    const rowH = 38;
    const titleW = 160;
    const cols: Cell[] = [
      { label: 'Nº da OS', value: data.orderId, width: 72 },
      {
        label: 'Data de Abertura',
        value: formatDateTime(data.openedAt),
        width: 108,
      },
      {
        label: 'Externo',
        value: data.isExternal ? 'Sim' : 'Não',
        width: 52,
      },
      {
        label: 'Prioridade',
        value: data.priorityLabel,
        width: 68,
      },
      {
        label: 'Status',
        value: data.statusLabel,
        width: CONTENT_WIDTH - titleW - 72 - 108 - 52 - 68,
      },
    ];

    let x = MARGIN_X;
    this.drawCell(doc, x, y, titleW, rowH, '', 'Dados da Ordem de Serviço', {
      labelSize: 10,
      valueSize: 10,
      valueBold: true,
      centerValue: true,
    });
    x += titleW;

    for (const col of cols) {
      this.drawCell(doc, x, y, col.width, rowH, col.label, col.value, {
        labelSize: 9,
        valueSize: 9,
        topPad: 6,
      });
      x += col.width;
    }

    return y + rowH;
  }

  private drawUserContactTable(
    doc: PDFKit.PDFDocument,
    data: ServiceOrderPdfData,
    y: number,
  ): number {
    const rowH = 38;
    const widths = [150, 95, 110, CONTENT_WIDTH - 150 - 95 - 110];
    const cells: Cell[] = [
      { label: 'Usuário', value: data.requester, width: widths[0] },
      {
        label: 'Matrícula',
        value: orNa(data.registrationNumber),
        width: widths[1],
      },
      {
        label: 'Telefone',
        value: formatPhone(data.contactPhone),
        width: widths[2],
      },
      {
        label: 'Nome do Contato',
        value: orNa(data.contactName),
        width: widths[3],
      },
    ];

    let x = MARGIN_X;
    for (const cell of cells) {
      this.drawCell(doc, x, y, cell.width, rowH, cell.label, cell.value, {
        labelSize: 9,
        valueSize: 9,
        topPad: 6,
      });
      x += cell.width;
    }

    return y + rowH;
  }

  private drawPatrimonyBlock(
    doc: PDFKit.PDFDocument,
    data: ServiceOrderPdfData,
    y: number,
  ): number {
    const rowH = 36;
    let currentY = y;

    const inventoryW = 100;
    const typeW = 140;
    const descriptionW = CONTENT_WIDTH - inventoryW - typeW;
    const inventoryValue = data.patrimonyInventoryNumber;
    const typeValue = data.patrimonyTypeName;
    const descriptionValue = data.patrimonyDescription;

    const firstRowH = Math.max(
      this.measureLabeledCellHeight(doc, inventoryValue, inventoryW),
      this.measureLabeledCellHeight(doc, typeValue, typeW),
      this.measureLabeledCellHeight(doc, descriptionValue, descriptionW),
    );

    this.drawCell(
      doc,
      MARGIN_X,
      currentY,
      inventoryW,
      firstRowH,
      'Nº Patrimônio',
      inventoryValue,
      { topPad: 6 },
    );
    this.drawCell(
      doc,
      MARGIN_X + inventoryW,
      currentY,
      typeW,
      firstRowH,
      'Tipo',
      typeValue,
      { topPad: 6 },
    );
    this.drawCell(
      doc,
      MARGIN_X + inventoryW + typeW,
      currentY,
      descriptionW,
      firstRowH,
      'Descrição',
      descriptionValue,
      { topPad: 6 },
    );
    currentY += firstRowH;

    this.drawCell(
      doc,
      MARGIN_X,
      currentY,
      CONTENT_WIDTH,
      rowH,
      'Secretaria',
      data.departmentLabel.toUpperCase(),
      { topPad: 6 },
    );
    currentY += rowH;

    this.drawCell(
      doc,
      MARGIN_X,
      currentY,
      CONTENT_WIDTH,
      rowH,
      'Local',
      data.locationName.toUpperCase(),
      { topPad: 6 },
    );
    currentY += rowH;

    const addressValue = data.locationAddress.toUpperCase() || NOT_REGISTERED;
    const addressRowH = this.measureLabeledCellHeight(
      doc,
      addressValue,
      CONTENT_WIDTH,
      9,
    );
    this.drawCell(
      doc,
      MARGIN_X,
      currentY,
      CONTENT_WIDTH,
      addressRowH,
      'Endereço',
      addressValue,
      { topPad: 6 },
    );
    currentY += addressRowH;

    return currentY;
  }

  /** Altura da célula label+valor permitindo quebra de linha no valor. */
  private measureLabeledCellHeight(
    doc: PDFKit.PDFDocument,
    value: string,
    cellWidth: number,
    valueSize = 9,
    topPad = 6,
    minHeight = 36,
  ): number {
    const textWidth = cellWidth - CELL_PAD_LEFT - CELL_PAD_RIGHT;
    const labelOffset = 13;
    const bottomPad = 6;

    doc.font('Helvetica').fontSize(valueSize);
    const valueHeight = doc.heightOfString(value || NOT_REGISTERED, {
      width: textWidth,
    });

    return Math.max(minHeight, topPad + labelOffset + valueHeight + bottomPad);
  }

  private drawDefectBlock(
    doc: PDFKit.PDFDocument,
    data: ServiceOrderPdfData,
    y: number,
  ): number {
    const labelH = 16;
    let currentY = y;

    currentY = this.drawFullWidthField(
      doc,
      currentY,
      'Tipo',
      data.defectType.toUpperCase(),
      labelH,
      22,
    );
    currentY = this.drawFullWidthField(
      doc,
      currentY,
      'Descrição do Defeito',
      data.defectDescription.toUpperCase(),
      labelH,
      34,
    );
    currentY = this.drawFullWidthField(
      doc,
      currentY,
      'Descrição do Serviço',
      data.serviceDescription.toUpperCase(),
      labelH,
      40,
    );
    currentY = this.drawFullWidthField(
      doc,
      currentY,
      'Técnico Responsável',
      data.responsibleTechnician.toUpperCase(),
      labelH,
      28,
    );

    if (data.labDescription || data.labTechnicianName) {
      currentY = this.drawFullWidthField(
        doc,
        currentY,
        'Descrição do Laboratório',
        (data.labDescription ?? NOT_REGISTERED).toUpperCase(),
        labelH,
        34,
      );
      currentY = this.drawFullWidthField(
        doc,
        currentY,
        'Técnico do Laboratório',
        (data.labTechnicianName ?? NOT_REGISTERED).toUpperCase(),
        labelH,
        28,
      );
    }

    return currentY;
  }

  private drawFullWidthField(
    doc: PDFKit.PDFDocument,
    y: number,
    label: string,
    value: string,
    labelH: number,
    valueH: number,
  ): number {
    const topPad = 6;
    const totalH = labelH + valueH + topPad;
    doc.rect(MARGIN_X, y, CONTENT_WIDTH, totalH).stroke('#000000');
    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .fillColor('#000000')
      .text(label, MARGIN_X + CELL_PAD_LEFT, y + topPad, {
        width: CONTENT_WIDTH - CELL_PAD_LEFT - CELL_PAD_RIGHT,
        lineBreak: false,
      });
    doc
      .font('Helvetica')
      .fontSize(9)
      .text(
        value || NOT_REGISTERED,
        MARGIN_X + CELL_PAD_LEFT,
        y + topPad + labelH,
        {
          width: CONTENT_WIDTH - CELL_PAD_LEFT - CELL_PAD_RIGHT,
          height: valueH - 4,
        },
      );
    return y + totalH;
  }

  private drawCenteredSectionTitle(
    doc: PDFKit.PDFDocument,
    title: string,
    y: number,
  ): number {
    doc
      .font('Helvetica-Bold')
      .fontSize(11)
      .fillColor('#000000')
      .text(title, MARGIN_X, y, {
        width: CONTENT_WIDTH,
        align: 'center',
        lineBreak: false,
      });
    return y + 16;
  }

  private drawCell(
    doc: PDFKit.PDFDocument,
    x: number,
    y: number,
    w: number,
    h: number,
    label: string,
    value: string,
    opts?: {
      labelSize?: number;
      valueSize?: number;
      valueBold?: boolean;
      centerValue?: boolean;
      topPad?: number;
    },
  ) {
    doc.rect(x, y, w, h).stroke('#000000');
    const textWidth = w - CELL_PAD_LEFT - CELL_PAD_RIGHT;
    const topPad = opts?.topPad ?? 6;
    if (label) {
      doc
        .font('Helvetica-Bold')
        .fontSize(opts?.labelSize ?? 9)
        .fillColor('#000000')
        .text(label, x + CELL_PAD_LEFT, y + topPad, {
          width: textWidth,
          lineBreak: false,
        });
      doc
        .font(opts?.valueBold ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(opts?.valueSize ?? 9)
        .text(value || NOT_REGISTERED, x + CELL_PAD_LEFT, y + topPad + 13, {
          width: textWidth,
          height: Math.max(0, h - topPad - 16),
          align: opts?.centerValue ? 'center' : 'left',
          lineBreak: true,
        });
    } else {
      doc
        .font(opts?.valueBold ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(opts?.valueSize ?? 9)
        .fillColor('#000000')
        .text(value, x + CELL_PAD_LEFT, y + h / 2 - 6, {
          width: textWidth,
          align: opts?.centerValue ? 'center' : 'left',
        });
    }
  }

  private drawSignatures(doc: PDFKit.PDFDocument) {
    const line = '_____________________________________________________________';
    const lineY1 = PAGE.height - 105;
    const lineY2 = PAGE.height - 48;

    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor('#000000')
      .text(line, MARGIN_X + 51, lineY1, {
        width: 407,
        align: 'center',
        lineBreak: false,
      });
    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .text('Técnico Responsável', MARGIN_X, lineY1 + 14, {
        width: CONTENT_WIDTH,
        align: 'center',
        lineBreak: false,
      });

    doc
      .font('Helvetica')
      .fontSize(10)
      .text(line, MARGIN_X + 51, lineY2, {
        width: 407,
        align: 'center',
        lineBreak: false,
      });
    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .text('Solicitante', MARGIN_X, lineY2 + 14, {
        width: CONTENT_WIDTH,
        align: 'center',
        lineBreak: false,
      });
  }
}
