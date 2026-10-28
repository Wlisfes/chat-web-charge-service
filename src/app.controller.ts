import { Get } from '@nestjs/common'
import { Public } from '@wlisfes/chat-web-base-schema/auth'
import { ApiServiceDecorator, ApifoxController } from '@wlisfes/chat-web-base-schema/decorator'
import { PreserveHttpStatus } from '@wlisfes/chat-web-base-schema/filters'
import { AppService } from '@/app.service'
import * as HealthDto from '@/health/dto/health.dto'

@ApifoxController('扣费服务-运行状态')
export class AppController {
    constructor(private readonly appService: AppService) {}

    @Public()
    @ApiServiceDecorator(Get(), { operation: { summary: '查看扣费服务信息' }, response: { type: String } })
    public async httpBaseChargeResolverService(): Promise<string> {
        return this.appService.httpBaseChargeResolverService()
    }

    @Public()
    @ApiServiceDecorator(Get('health/live'), {
        operation: { summary: '扣费服务存活检查' },
        response: { type: HealthDto.ServiceLivenessResponseDto, description: '进程正常时返回 UP' }
    })
    public async httpBaseChargeLiveHealth(): Promise<HealthDto.ServiceLivenessResponseDto> {
        return this.appService.httpBaseChargeLiveHealth()
    }

    @Public()
    @ApiServiceDecorator(Get(['health', 'health/ready']), {
        operation: { summary: '扣费服务就绪检查' },
        response: { type: HealthDto.ServiceReadinessResponseDto, description: '数据库和 RabbitMQ 状态' }
    })
    @PreserveHttpStatus()
    public async httpBaseChargeReadyHealth(): Promise<HealthDto.ServiceReadinessResponseDto> {
        return this.appService.httpBaseChargeReadyHealth()
    }
}
