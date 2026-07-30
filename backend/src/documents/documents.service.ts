import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FirePosition } from '../fire-positions/fire-position.entity';
import { ServiceOrder } from '../service-orders/service-order.entity';
import { WeaponSystem } from '../weapon-systems/weapon-system.entity';
import { DepotShellStock } from '../depot-shell-stock/depot-shell-stock.entity';

export type DocumentKind = 'summary' | 'orders' | 'stock' | 'readiness';

export function escapeCsvCell(value: string | number): string {
  const text = String(value);
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

@Injectable()
export class DocumentsService {
  constructor(
    @InjectRepository(ServiceOrder) private readonly orders: Repository<ServiceOrder>,
    @InjectRepository(WeaponSystem) private readonly weapons: Repository<WeaponSystem>,
    @InjectRepository(FirePosition) private readonly positions: Repository<FirePosition>,
    @InjectRepository(DepotShellStock) private readonly shellStock: Repository<DepotShellStock>,
  ) {}

  async buildText(kind: DocumentKind): Promise<string> {
    const generatedAt = new Intl.DateTimeFormat('uk-UA', {
      timeZone: 'Europe/Kyiv', dateStyle: 'short', timeStyle: 'medium',
    }).format(new Date());

    if (kind === 'orders') {
      const orders = await this.orders.find({ order: { createdAt: 'DESC' }, take: 100 });
      return ['ЄВКЛІДА — звіт по заявках', `Сформовано: ${generatedAt}`, '', ...orders.map((o) => `${o.orderNumber}; статус=${o.status}; план=${o.plannedQuantity}; факт=${o.actualQuantity ?? '-'}; ціль=${o.targetLat},${o.targetLng}`)].join('\n');
    }

    if (kind === 'stock') {
      const stock = await this.shellStock.find({ order: { depotId: 'ASC' } });
      return ['ЄВКЛІДА — залишки БК', `Сформовано: ${generatedAt}`, '', ...stock.map((s) => `depot=${s.depotId}; shell=${s.shellId}; quantity=${s.quantity}`)].join('\n');
    }

    if (kind === 'readiness') {
      const [weapons, positions] = await Promise.all([this.weapons.find(), this.positions.find()]);
      return ['ЄВКЛІДА — боєготовність', `Сформовано: ${generatedAt}`, '', 'СГ:', ...weapons.map((w) => `${w.callsign || w.serialNumber || w.id}; status=${w.readinessStatus}; location=${w.locationType}; fp=${w.firePositionId || '-'}`), '', 'ВП:', ...positions.map((p) => `${p.name}; has_sg=${p.hasSg}; status=${p.readinessStatus}; reason=${p.notReadyReason || '-'}`)].join('\n');
    }

    const [orders, weapons, positions, stock] = await Promise.all([
      this.orders.count(), this.weapons.count(), this.positions.count(), this.shellStock.find(),
    ]);
    const shellsTotal = stock.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    return ['ЄВКЛІДА — зведений звіт', `Сформовано: ${generatedAt}`, '', `Заявки: ${orders}`, `СГ: ${weapons}`, `ВП: ${positions}`, `Снаряди на складах: ${shellsTotal}`].join('\n');
  }

  async buildCsv(kind: DocumentKind): Promise<string> {
    if (kind === 'orders') {
      const rows = await this.orders.find({ order: { createdAt: 'DESC' }, take: 1000 });
      return this.csv(['orderNumber', 'status', 'plannedQuantity', 'actualQuantity', 'targetLat', 'targetLng'], rows.map((o) => [o.orderNumber, o.status, o.plannedQuantity, o.actualQuantity ?? '', o.targetLat, o.targetLng]));
    }
    if (kind === 'stock') {
      const rows = await this.shellStock.find();
      return this.csv(['depotId', 'shellId', 'quantity'], rows.map((s) => [s.depotId, s.shellId, s.quantity]));
    }
    const rows = await this.weapons.find();
    return this.csv(['id', 'callsign', 'serialNumber', 'readinessStatus', 'locationType', 'firePositionId'], rows.map((w) => [w.id, w.callsign ?? '', w.serialNumber ?? '', w.readinessStatus, w.locationType, w.firePositionId ?? '']));
  }

  async buildPdf(kind: DocumentKind): Promise<Buffer> {
    const text = await this.buildText(kind);
    return this.minimalPdf(text);
  }

  private csv(headers: string[], rows: Array<Array<string | number>>): string {
    return [headers.map(escapeCsvCell).join(','), ...rows.map((row) => row.map(escapeCsvCell).join(','))].join('\n');
  }

  private minimalPdf(text: string): Buffer {
    const safeLines = text.split('\n').slice(0, 45).map((line) => line.replace(/[()\\]/g, ' '));
    const content = ['BT', '/F1 10 Tf', '40 790 Td', ...safeLines.map((line, index) => `${index === 0 ? '' : '0 -14 Td '}(${line}) Tj`), 'ET'].join('\n');
    const objects = [
      '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
      '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
      '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj',
      '4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
      `5 0 obj << /Length ${Buffer.byteLength(content)} >> stream\n${content}\nendstream endobj`,
    ];
    let pdf = '%PDF-1.4\n';
    const offsets = [0];
    for (const object of objects) {
      offsets.push(Buffer.byteLength(pdf));
      pdf += object + '\n';
    }
    const xref = Buffer.byteLength(pdf);
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (let i = 1; i < offsets.length; i += 1) pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
    pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    return Buffer.from(pdf);
  }
}
