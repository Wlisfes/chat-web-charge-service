/** Charge 必须与 Finance 使用同一个 Redis 逻辑库，才能直接增减供应商钱包哈希。 */
export const CHARGE_REDIS_DATABASE = 3

/** 全部供应商余额放在同一个哈希，field 为供应商主键。 */
export const SRM_WALLET_BALANCE_KEY = 'chat-web-finance:srm:balances'

export function srmWalletBalanceField(userKeyId: number): string {
    return String(userKeyId)
}
