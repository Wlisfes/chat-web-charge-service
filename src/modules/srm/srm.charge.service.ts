import { Injectable, Logger } from '@nestjs/common'
import { DataSource, InjectDataSource } from '@wlisfes/chat-web-base-schema/database'
import { type SrmUserBillingPayload } from '@wlisfes/chat-web-base-schema/rabbitmq'
import * as Schema from '@wlisfes/chat-web-base-schema'

export type ChargeApplyResult = 'applied' | 'duplicate' | 'invalid'

export interface ChargeCanSendResult {
    allowed: boolean
    payMode: 'prepaid' | 'postpaid'
    balanceUsd: number
    reason?: string
}

/**
 * R 端供应商扣费。
 * 收到发送成功或已送达回执后扣一次；先付余额小于等于 0 不允许再发，后付可以扣成负数。
 */
@Injectable()
export class SrmChargeService {
    private readonly logger = new Logger(SrmChargeService.name)

    constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

    public async canSend(userKeyId: number, payMode: string): Promise<ChargeCanSendResult> {
        const mode = payMode === 'prepaid' ? 'prepaid' : 'postpaid'
        const account = await this.dataSource.getRepository(Schema.TbFinanceSrmUser).findOne({
            where: { userKeyId },
            select: { balanceUsd: true, payMode: true }
        })
        const balanceUsd = account?.balanceUsd ?? 0
        if (mode === 'prepaid' && balanceUsd <= 0) {
            return { allowed: false, payMode: mode, balanceUsd, reason: '预付余额不足' }
        }
        return { allowed: true, payMode: mode, balanceUsd }
    }

    public async apply(billing: Partial<SrmUserBillingPayload> | undefined): Promise<ChargeApplyResult> {
        const event = this.normalize(billing)
        if (!event) return 'invalid'
        return this.dataSource.transaction(async manager => {
            const exists = await manager.getRepository(Schema.TbFinanceSrmUserBill).exists({
                where: [{ eventId: event.eventId }, { msgId: event.msgId }]
            })
            if (exists) return 'duplicate'
            await manager
                .createQueryBuilder()
                .insert()
                .into(Schema.TbFinanceSrmUser)
                .values({ userKeyId: event.userKeyId, payMode: event.payMode, balanceUsd: 0, billedUsd: 0, billCount: 0 })
                .orIgnore()
                .updateEntity(false)
                .execute()
            await manager
                .createQueryBuilder()
                .update(Schema.TbFinanceSrmUser)
                .set({
                    balanceUsd: () => `${Schema.TbFinanceSrmUserColumn.BALANCE_USD} - ${event.costUsd}`,
                    billedUsd: () => `${Schema.TbFinanceSrmUserColumn.BILLED_USD} + ${event.costUsd}`,
                    billCount: () => `${Schema.TbFinanceSrmUserColumn.BILL_COUNT} + 1`,
                    payMode: event.payMode
                })
                .where('userKeyId = :userKeyId', { userKeyId: event.userKeyId })
                .execute()
            const account = await manager
                .getRepository(Schema.TbFinanceSrmUser)
                .findOneOrFail({ where: { userKeyId: event.userKeyId }, select: { balanceUsd: true } })
            await manager.getRepository(Schema.TbFinanceSrmUserBill).insert({
                eventId: event.eventId,
                msgId: event.msgId,
                userKeyId: event.userKeyId,
                simbankKeyId: event.simbankKeyId,
                portKeyId: event.portKeyId,
                payMode: event.payMode,
                trigger: event.trigger,
                segments: event.segments,
                costUsd: event.costUsd,
                balanceUsd: account.balanceUsd,
                occurredTime: event.occurredTime
            })
            this.logger.log(
                `供应商已扣费：msgId=${event.msgId}，userKeyId=${event.userKeyId}，payMode=${event.payMode}，costUsd=${event.costUsd}，balanceUsd=${account.balanceUsd}`
            )
            return 'applied'
        })
    }

    private normalize(billing: Partial<SrmUserBillingPayload> | undefined) {
        const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '')
        const positive = (value: unknown) => {
            const number = Number(value)
            return Number.isInteger(number) && number > 0 ? number : 0
        }
        const eventId = text(billing?.eventId)
        const msgId = text(billing?.msgId)
        const userKeyId = positive(billing?.userKeyId)
        const payMode =
            billing?.payMode === 'prepaid'
                ? Schema.TbFinanceSrmUserPayMode.PREPAID
                : billing?.payMode === 'postpaid'
                  ? Schema.TbFinanceSrmUserPayMode.POSTPAID
                  : undefined
        const trigger = String(billing?.trigger || '')
        const chargeable = trigger === 'success' || trigger === 'delivered'
        const costUsd = Number(billing?.costUsd)
        const occurredTime = new Date(text(billing?.occurredTime))
        if (!eventId || !msgId || !userKeyId || !payMode || !chargeable || !Number.isSafeInteger(costUsd) || costUsd < 0) {
            this.logger.warn(`扣费事件不完整，不扣费：${JSON.stringify(billing)}`)
            return undefined
        }
        return {
            eventId,
            msgId,
            userKeyId,
            simbankKeyId: positive(billing?.simbankKeyId),
            portKeyId: positive(billing?.portKeyId),
            payMode,
            trigger: Schema.TbFinanceSrmUserBillTrigger.SUCCESS,
            segments: positive(billing?.segments) || 1,
            costUsd,
            occurredTime: Number.isNaN(occurredTime.getTime()) ? new Date() : occurredTime
        }
    }
}
