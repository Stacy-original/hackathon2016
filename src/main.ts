import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { json, urlencoded } from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Enable CORS
  app.enableCors({
    origin: (origin, callback) => {
      const allowedOrigins = [
        'https://agroaudit.vercel.app',
        'http://localhost:3000',
        'http://localhost:3001',
        'http://localhost:4200',
      ];
      
      if (!origin || allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
  });
  
  // Increase payload limit for file uploads
  app.use(json({ limit: '50mb' }));
  app.use(urlencoded({ extended: true, limit: '50mb' }));
  
  // Global validation pipe
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true,
  }));
  
  // Global prefix
  app.setGlobalPrefix('api');
  
  // USE THIS: Always use process.env.PORT (Render sets this automatically)
  const port = process.env.PORT || 3001;
  await app.listen(port, '0.0.0.0'); // Important: bind to 0.0.0.0 for Render
  
  console.log(`🚀 AgroAudit AI Backend running on: http://localhost:${port}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔒 API Security: Enabled`);
}

bootstrap();