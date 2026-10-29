import * as Schema from '@wlisfes/chat-web-base-schema'

/** Charge 读写 Finance 供应商钱包和扣费流水。表仍在 finance 库，余额由 Redis 维护，扣费流水由本服务写入。 */
export const CHARGE_MYSQL_CONFIG_KEY = 'database.chat-web-finance'
export const CHARGE_MYSQL_ENTITIES = [Schema.TbFinanceSrmUserWallet, Schema.TbFinanceSrmUserDeduct] as const
export const CHARGE_RABBITMQ_VHOST = '/chat-sms'
