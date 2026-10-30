/** Charge 必须与 Finance 使用同一个 Redis 逻辑库，才能直接增减供应商钱包哈希。 */
export const CHARGE_REDIS_DATABASE = 3

/** 全部供应商余额放在同一个哈希，field 为供应商主键。 */
export const SRM_WALLET_BALANCE_KEY = 'chat-web-finance:srm:balances'

/** 余额变化标记前缀；每个账户一个 key，Finance 用 GETDEL 原子认领。 */
export const SRM_WALLET_BALANCE_DIRTY_PREFIX = 'chat-web-finance:srm:balance-dirty'

export function srmWalletBalanceField(userKeyId: number): string {
    return String(userKeyId)
}

export function srmWalletBalanceDirtyKey(userKeyId: number): string {
    return `${SRM_WALLET_BALANCE_DIRTY_PREFIX}:${userKeyId}`
}
