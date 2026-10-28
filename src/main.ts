import 'dotenv/config'
import { NestFactory } from '@nestjs/core'
import { NestExpressApplication } from '@nestjs/platform-express'
import { setupSwagger } from '@wlisfes/chat-web-base-schema'
import { ReadableConsoleLogger, createRequestLoggingMiddleware } from '@wlisfes/chat-web-base-schema/logging'
import { requestContextMiddleware } from '@wlisfes/chat-web-base-schema/request-context'
import { AppModule } from '@/app.module'

const logger = new ReadableConsoleLogger({ NODE_ENV: process.env.NODE_ENV, prefix: process.env.NACOS_SERVICE_NAME })

async function bootstrap() {
    const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger })
    app.enableShutdownHooks()
    app.use(requestContextMiddleware)
    app.use(createRequestLoggingMiddleware(process.env.NACOS_SERVICE_NAME))
    return await setupSwagger(app, {
        title: 'Chat Web Charge 服务 API',
        description: '扣费服务：R 端供应商扣费与发送前余额检查',
        port: process.env.PORT,
        NODE_ENV: process.env.NODE_ENV ?? 'development'
    })
}

void bootstrap().catch(error => {
    logger.error(error, 'Bootstrap')
    process.exitCode = 1
})
