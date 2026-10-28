import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { APP_GUARD } from '@nestjs/core'
import { AuthorizationGuard, AuthorizationModule, GatewayPrincipalGuard, GatewayPrincipalModule } from '@wlisfes/chat-web-base-schema/auth'
import { HttpResponseModule } from '@wlisfes/chat-web-base-schema/interceptor'
import { forRootNacosRuntimeOptions, NacosModule } from '@wlisfes/chat-web-base-schema/nacos'
import { RabbitmqModule, setupSrmUserBillingTopology } from '@wlisfes/chat-web-base-schema/rabbitmq'
import { AppController } from '@/app.controller'
import { AppService } from '@/app.service'
import { DatabaseModule } from '@/database/database.module'
import { HealthModule } from '@/health/health.module'
import { CHARGE_RABBITMQ_VHOST } from '@/database/database.constants'
import { SrmChargeModule } from '@/modules/srm/srm.charge.module'

@Module({
    imports: [
        HttpResponseModule,
        ConfigModule.forRoot({ isGlobal: true }),
        NacosModule.forRoot(forRootNacosRuntimeOptions(process.env)),
        RabbitmqModule.forRoot({ vhost: CHARGE_RABBITMQ_VHOST, setup: setupSrmUserBillingTopology }),
        DatabaseModule,
        GatewayPrincipalModule,
        AuthorizationModule,
        HealthModule,
        SrmChargeModule
    ],
    controllers: [AppController],
    providers: [
        AppService,
        { provide: APP_GUARD, useExisting: GatewayPrincipalGuard },
        { provide: APP_GUARD, useExisting: AuthorizationGuard }
    ]
})
export class AppModule {}
