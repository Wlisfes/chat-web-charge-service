import { Body, HttpCode, Post } from '@nestjs/common'
import { Public } from '@wlisfes/chat-web-base-schema/auth'
import { ApiServiceDecorator, ApifoxController } from '@wlisfes/chat-web-base-schema/decorator'
import { SrmChargeService, type ChargeCanSendResult } from '@/modules/srm/srm.charge.service'

class CanSendDto {
    userKeyId: number
    payMode: 'prepaid' | 'postpaid'
}

@ApifoxController('扣费服务-供应商扣费')
export class SrmChargeController {
    constructor(private readonly chargeService: SrmChargeService) {}

    @Public()
    @HttpCode(200)
    @ApiServiceDecorator(Post('srm/can-send'), {
        operation: { summary: '发送前检查预付余额' },
        response: { description: '预付余额大于 0 或后付时允许发送' }
    })
    public async httpBaseSrmCanSend(@Body() body: CanSendDto): Promise<ChargeCanSendResult> {
        return this.chargeService.canSend(Number(body?.userKeyId), body?.payMode)
    }
}
