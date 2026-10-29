/** Charge 必须与 Finance 使用同一个 Redis 逻辑库，才能直接增减供应商钱包哈希。 */
export const CHARGE_REDIS_DATABASE = 3

/** Finance 供应商钱包 Redis 哈希键前缀。 */
export const SRM_WALLET_REDIS_PREFIX = 'chat-web-finance:srm:wallet'

/** 钱包哈希中的余额字段；Charge 使用 HINCRBY 原子扣减。 */
export const SRM_WALLET_BALANCE_FIELD = 'balance'

/** 生成供应商钱包 Redis 哈希键。 */
export function srmWalletRedisKey(userKeyId: number): string {
    return `${SRM_WALLET_REDIS_PREFIX}:${userKeyId}`
}
