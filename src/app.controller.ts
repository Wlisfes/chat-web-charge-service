import { Get } from '@nestjs/common'
import { Public } from '@wlisfes/chat-web-base-schema/auth'
import { ApiServiceDecorator, ApifoxController } from '@wlisfes/chat-web-base-schema/decorator'
import { AppService } from '@/app.service'

@ApifoxController('扣费服务-运行状态')
export class AppController {
    constructor(private readonly appService: AppService) {}

    @Public()
    @ApiServiceDecorator(Get(), { operation: { summary: '查看扣费服务信息' }, response: { type: String } })
    public async httpBaseChargeResolverService(): Promise<string> {
        return this.appService.httpBaseChargeResolverService()
    }
}
