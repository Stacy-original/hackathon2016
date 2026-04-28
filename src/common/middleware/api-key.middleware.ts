import { Injectable, NestMiddleware, UnauthorizedException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ApiKeyMiddleware implements NestMiddleware {
  private readonly validApiKeys: string[];
  
  constructor(private configService: ConfigService) {
    this.validApiKeys = [
      this.configService.get('USER_API_KEY'),
      this.configService.get('ADMIN_API_KEY'),
      this.configService.get('GOVERNMENT_API_KEY'),
    ].filter(key => key);
  }
  
  use(req: Request, res: Response, next: NextFunction) {
    const apiKey = req.headers['x-api-key'];
    
    if (!apiKey) {
      throw new UnauthorizedException('API key required');
    }
    
    const keyIndex = this.validApiKeys.indexOf(apiKey as string);
    
    if (keyIndex === -1) {
      throw new UnauthorizedException('Invalid API key');
    }
    
    // Set role based on API key type - FIX: Use user object instead of userRole
    let role = 0; // USER default
    if (apiKey === this.configService.get('ADMIN_API_KEY')) {
      role = 2; // ADMIN
    } else if (apiKey === this.configService.get('GOVERNMENT_API_KEY')) {
      role = 1; // GOVERNMENT
    }
    
    // Attach user object to request (what RolesGuard expects)
    req['user'] = { role: role };
    
    next();
  }
}