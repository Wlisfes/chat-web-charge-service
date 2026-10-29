import { Injectable, Logger } from '@nestjs/common'
import { RedisService } from '@wlisfes/chat-web-base-schema/redis'
import { DataSource, InjectDataSource } from '@wlisfes/chat-web-base-schema/database'
import { SRM_WALLET_BALANCE_FIELD, srmWalletRedisKey } from '@/modules/srm/srm.charge.constants'
import { type SrmUserBillingPayload } from '@wlisfes/chat-web-base-schema/rabbitmq'
import * as Schema from '@wlisfes/chat-web-base-schema'

export type ChargeApplyResult = 'applied' | 'duplicate' | 'invalid'

/**
 * R 端供应商扣费。
 * 收到设备提交或发送成功回执后扣一次；扣费金额已是钱包本币，不做 USD 转换，余额只在 Redis 原子扣减。
 * 后付可以扣成负数；发送前余额校验由 Dispatch 直接读取 Redis 完成。
 */
@Injectable()
export class SrmChargeService {
    private readonly logger = new Logger(SrmChargeService.name)

    constructor(
        @InjectDataSource() private readonly dataSource: DataSource,
        private readonly redisService: RedisService
    ) {}

    /** 幂等写入扣费流水，并从 Redis 原子扣减钱包余额。 */
    public async apply(billing: Partial<SrmUserBillingPayload> | undefined): Promise<ChargeApplyResult> {
        const event = this.normalize(billing)
        if (!event) return 'invalid'
        let deducted = false
        try {
            return await this.dataSource.transaction(async manager => {
                const deductRepository = manager.getRepository(Schema.TbFinanceSrmUserDeduct)
                const exists = await deductRepository.exists({ where: { eventId: event.eventId } })
                if (exists) return 'duplicate'
                const wallet = await manager.getRepository(Schema.TbFinanceSrmUserWallet).findOne({
                    where: { userKeyId: event.userKeyId },
                    select: { currency: true }
                })
                if (!wallet) throw new Error(`供应商钱包不存在：userKeyId=${event.userKeyId}`)
                await this.findRedisBalance(event.userKeyId)
                const balance = await this.redisService.hIncrBy(srmWalletRedisKey(event.userKeyId), SRM_WALLET_BALANCE_FIELD, -event.amount)
                deducted = true
                try {
                    await deductRepository.insert({
                        eventId: event.eventId,
                        userKeyId: event.userKeyId,
                        currency: wallet.currency,
                        bizType: Schema.TbFinanceSrmUserDeductBizType.SMS,
                        amount: event.amount,
                        businessId: event.msgId,
                        occurredTime: event.occurredTime
                    })
                } catch (error) {
                    await this.restoreRedisBalance(event.userKeyId, event.amount)
                    deducted = false
                    const duplicatedAfterRace = await deductRepository.exists({ where: { eventId: event.eventId } })
                    if (duplicatedAfterRace) return 'duplicate'
                    throw error
                }
                this.logger.log(
                    `供应商已扣费：eventId=${event.eventId}，msgId=${event.msgId}，userKeyId=${event.userKeyId}，amount=${event.amount}，balance=${balance}`
                )
                return 'applied'
            })
        } catch (error) {
            if (deducted) await this.restoreRedisBalance(event.userKeyId, event.amount)
            throw error
        }
    }

    /** 读取 Redis 中的最新钱包余额；字段缺失或格式错误时拒绝继续扣费。 */
    private async findRedisBalance(userKeyId: number): Promise<number> {
        const snapshot = await this.redisService.hGetAll(srmWalletRedisKey(userKeyId))
        const raw = snapshot[SRM_WALLET_BALANCE_FIELD]
        if (typeof raw !== 'string' || !/^-?\d+$/.test(raw)) {
            throw new Error(`供应商钱包${userKeyId}的 Redis 余额缺失或格式错误`)
        }
        const balance = Number(raw)
        if (!Number.isSafeInteger(balance)) {
            throw new Error(`供应商钱包${userKeyId}的 Redis 余额超出安全整数范围`)
        }
        return balance
    }

    /** 扣费流水写入失败时，通过 HINCRBY 反向补回已经扣掉的余额。 */
    private async restoreRedisBalance(userKeyId: number, amount: number): Promise<void> {
        try {
            await this.redisService.hIncrBy(srmWalletRedisKey(userKeyId), SRM_WALLET_BALANCE_FIELD, amount)
        } catch (error) {
            this.logger.error(
                `供应商 Redis 余额回补失败：userKeyId=${userKeyId}，amount=${amount}，原因=${error instanceof Error ? error.message : String(error)}`
            )
        }
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
                ? Schema.TbFinanceSrmUserWalletPayMode.PREPAID
                : billing?.payMode === 'postpaid'
                  ? Schema.TbFinanceSrmUserWalletPayMode.POSTPAID
                  : undefined
        const trigger = text(billing?.trigger)
        const chargeable = trigger === 'submitted' || trigger === 'success'
        // 消息字段沿用 costUsd，值已是钱包本币金额（放大百万倍），这里不做汇率转换。
        const amount = Number(billing?.costUsd)
        const occurredTime = new Date(text(billing?.occurredTime))
        if (!eventId || !msgId || !userKeyId || !payMode || !chargeable || !Number.isSafeInteger(amount) || amount < 0) {
            this.logger.warn(`扣费事件不完整，不扣费：${JSON.stringify(billing)}`)
            return undefined
        }
        return {
            eventId,
            msgId,
            userKeyId,
            payMode,
            trigger,
            amount,
            occurredTime: Number.isNaN(occurredTime.getTime()) ? new Date() : occurredTime
        }
    }
}
