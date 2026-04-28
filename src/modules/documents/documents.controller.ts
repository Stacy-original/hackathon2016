import { Controller, Post, Get, Body, Param, Query, UseGuards, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { DocumentsService } from './documents.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UserRole } from '../../common/interfaces/user.interface';

@Controller('documents')
@UseGuards(RolesGuard)
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Post()
  @Roles(UserRole.USER, UserRole.GOVERNMENT, UserRole.ADMIN)
  async createDocument(@Body() documentData: any) {
    return this.documentsService.create(documentData);
  }

  @Post(':id/verify')
  @Roles(UserRole.GOVERNMENT, UserRole.ADMIN)
  @UseInterceptors(FileInterceptor('document'))
  async verifyDocument(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.documentsService.verifyDocument(id, file.buffer);
  }

  @Get('company/:companyId')
  @Roles(UserRole.GOVERNMENT, UserRole.ADMIN)
  async getDocumentsByCompany(@Param('companyId') companyId: string) {
    return this.documentsService.getDocumentsByCompany(companyId);
  }

  @Get('suspicious')
  @Roles(UserRole.GOVERNMENT, UserRole.ADMIN)
  async getSuspiciousDocuments() {
    return this.documentsService.getSuspiciousDocuments();
  }

  @Get()
  @Roles(UserRole.GOVERNMENT, UserRole.ADMIN)
  async getAllDocuments() {
    return this.documentsService.getAllDocuments();
  }

  @Get(':id')
  @Roles(UserRole.GOVERNMENT, UserRole.ADMIN)
  async getDocumentById(@Param('id') id: string) {
    return this.documentsService.findById(id);
  }
}