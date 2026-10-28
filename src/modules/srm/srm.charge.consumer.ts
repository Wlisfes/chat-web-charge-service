import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common'
import { RabbitmqService, SMS_SRM_USER_BILLING_QUEUE, type SrmUserBillingPayload } from '@wlisfes/chat-web-base-schema/rabbitmq'
import { SrmChargeService } from '@/modules/srm/srm.charge.service'

/** 消费回执触发的扣费事件。重复事件确认跳过，不完整事件拒绝进死信。 */
@Injectable()
export class SrmChargeConsumer implements OnApplicationBootstrap {
    private readonly logger = new Logger(SrmChargeConsumer.name)

    constructor(
        private readonly rabbitmqService: RabbitmqService,
        private readonly chargeService: SrmChargeService
    ) {}

    public async onApplicationBootstrap(): Promise<void> {
        await this.rabbitmqService.consume<SrmUserBillingPayload>(SMS_SRM_USER_BILLING_QUEUE, async billing => this.fetchCharge(billing))
    }

    public async fetchCharge(billing: SrmUserBillingPayload): Promise<'ack' | 'reject'> {
        const result = await this.chargeService.apply(billing)
        const summary = `eventId=${billing?.eventId}，msgId=${billing?.msgId}，userKeyId=${billing?.userKeyId}，payMode=${billing?.payMode}`
        if (result === 'applied') this.logger.log(`扣费已完成：${summary}`)
        else if (result === 'duplicate') this.logger.log(`扣费事件重复，已跳过：${summary}`)
        else this.logger.warn(`扣费事件不完整，进入死信：${summary}`)
        return result === 'invalid' ? 'reject' : 'ack'
    }
}
