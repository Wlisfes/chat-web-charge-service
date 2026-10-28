import { Injectable, ServiceUnavailableException } from '@nestjs/common'
import * as HealthDto from '@/health/dto/health.dto'
import { HealthService } from '@/health/health.service'

@Injectable()
export class AppService {
    constructor(private readonly healthService: HealthService) {}

    public async httpBaseChargeResolverService(): Promise<string> {
        return 'Chat Web Charge Service'
    }

    public async httpBaseChargeLiveHealth(): Promise<HealthDto.ServiceLivenessResponseDto> {
        return this.healthService.getLiveness()
    }

    public async httpBaseChargeReadyHealth(): Promise<HealthDto.ServiceReadinessResponseDto> {
        const result = await this.healthService.getReadiness()
        if (result.status !== 'UP') throw new ServiceUnavailableException({ message: '扣费服务尚未就绪', data: result })
        return result
    }
}
