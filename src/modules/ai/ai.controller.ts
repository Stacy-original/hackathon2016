// modules/ai/ai.controller.ts
import { Controller, Post, Get, Body, Param, UseInterceptors, UploadedFile, UseGuards, Query } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AiService, ProcessedReceiptResult } from './ai.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UserRole } from '../../common/interfaces/user.interface';

@Controller('ai')
@UseGuards(RolesGuard)
export class AiController {
  constructor(private readonly aiService: AiService) {}
  
  @Post('process-receipt')
  @Roles(UserRole.USER, UserRole.GOVERNMENT, UserRole.ADMIN)
  @UseInterceptors(FileInterceptor('receipt'))
  async processReceipt(
    @UploadedFile() file: Express.Multer.File,
    @Body('companyId') companyId?: string,
  ): Promise<ProcessedReceiptResult> {
    return this.aiService.processReceiptWithGemini(file, companyId);
  }
  
  // Keep existing methods...
  @Post('scan-document')
  @Roles(UserRole.GOVERNMENT, UserRole.ADMIN)
  @UseInterceptors(FileInterceptor('document'))
  async scanDocument(@UploadedFile() file: Express.Multer.File) {
    return this.aiService.scanDocument(file.buffer);
  }
  
  @Post('audit/:companyId')
  @Roles(UserRole.GOVERNMENT, UserRole.ADMIN)
  async runAudit(@Param('companyId') companyId: string) {
    return this.aiService.runFullAudit(companyId);
  }
  
  @Get('risk-dashboard')
  @Roles(UserRole.GOVERNMENT, UserRole.ADMIN)
  async getRiskDashboard() {
    return this.aiService.getRiskDashboard();
  }
}