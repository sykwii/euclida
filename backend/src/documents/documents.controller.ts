import { Controller, Get, Param, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DocumentsService, type DocumentKind } from './documents.service';

@UseGuards(JwtAuthGuard)
@Controller('documents')
export class DocumentsController {
  constructor(private readonly service: DocumentsService) {}

  @Get(':kind/text')
  async text(@Param('kind') kind: string, @Res() res: Response) {
    const body = await this.service.buildText(kind as DocumentKind);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(body);
  }

  @Get(':kind/csv')
  async csv(@Param('kind') kind: string, @Res() res: Response) {
    const body = await this.service.buildCsv(kind as DocumentKind);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="euclida-${kind}.csv"`);
    res.send(body);
  }

  @Get(':kind/pdf')
  async pdf(@Param('kind') kind: string, @Res() res: Response) {
    const body = await this.service.buildPdf(kind as DocumentKind);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="euclida-${kind}.pdf"`);
    res.send(body);
  }
}
