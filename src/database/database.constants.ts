import * as Schema from '@wlisfes/chat-web-base-schema'

/** Charge 读写 Finance 供应商账户和扣费流水。表仍在 finance 库，扣费写入由本服务负责。 */
export const CHARGE_MYSQL_CONFIG_KEY = 'database.chat-web-finance'
export const CHARGE_MYSQL_ENTITIES = [Schema.TbFinanceSrmUser, Schema.TbFinanceSrmUserBill] as const
export const CHARGE_RABBITMQ_VHOST = '/chat-sms'
