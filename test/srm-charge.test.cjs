const test = require('node:test')
const assert = require('node:assert/strict')
const Schema = require('@wlisfes/chat-web-base-schema')
const { SrmChargeService } = require('../dist/modules/srm/srm.charge.service')

function redis(balance = 100) {
    const state = { balance: String(balance), credit: '0' }
    const increments = []
    return {
        state,
        increments,
        async hGetAll() {
            return { ...state }
        },
        async hIncrBy(key, field, increment) {
            increments.push({ key, field, increment })
            state[field] = String(Number(state[field] ?? 0) + increment)
            return Number(state[field])
        }
    }
}

function fake({ exists = false, wallet = { currency: 'USD' }, insertError } = {}) {
    const deducts = []
    const manager = {
        getRepository(entity) {
            if (entity === Schema.TbFinanceSrmUserDeduct) {
                return {
                    exists: async ({ where }) => exists || deducts.some(row => row.eventId === where.eventId),
                    insert: async row => {
                        if (insertError) throw insertError
                        if (deducts.some(item => item.eventId === row.eventId)) throw new Error('duplicate')
                        deducts.push(row)
                    }
                }
            }
            if (entity === Schema.TbFinanceSrmUserWallet) {
                return { findOne: async () => wallet }
            }
            throw new Error(`未预期的实体：${entity?.name}`)
        }
    }
    const dataSource = {
        transaction: async work => work(manager),
        getRepository: entity => manager.getRepository(entity)
    }
    return { deducts, dataSource }
}

function billing(overrides = {}) {
    return {
        eventId: 'm1:submitted',
        msgId: 'm1',
        userKeyId: 1,
        payMode: 'prepaid',
        trigger: 'submitted',
        costUsd: 10,
        occurredTime: '2026-10-29T12:00:00.000Z',
        ...overrides
    }
}

test('发送前余额从 Redis 读取，预付小于等于 0 不能发，后付可以发', async () => {
    const empty = fake()
    const emptyRedis = redis(0)
    const emptyService = new SrmChargeService(empty.dataSource, emptyRedis)
    assert.equal((await emptyService.canSend(1, 'prepaid')).allowed, false)
    assert.equal((await emptyService.canSend(1, 'postpaid')).allowed, true)

    const funded = fake()
    const fundedService = new SrmChargeService(funded.dataSource, redis(100))
    assert.equal((await fundedService.canSend(1, 'prepaid')).allowed, true)
})

test('提交和发送成功事件扣 Redis 余额，并写入扣费流水', async () => {
    const box = fake()
    const cache = redis(100)
    const service = new SrmChargeService(box.dataSource, cache)
    assert.equal(await service.apply(billing()), 'applied')
    assert.equal(cache.state.balance, '90')
    assert.deepEqual(cache.increments, [{ key: 'chat-web-finance:srm:wallet:1', field: 'balance', increment: -10 }])
    assert.equal(box.deducts.length, 1)
    assert.equal(box.deducts[0].eventId, 'm1:submitted')
    assert.equal(box.deducts[0].currency, 'USD')
    assert.equal(box.deducts[0].bizType, 'sms')
    assert.equal(box.deducts[0].amount, 10)
    assert.equal(box.deducts[0].businessId, 'm1')

    const successBox = fake()
    const successCache = redis(50)
    const successService = new SrmChargeService(successBox.dataSource, successCache)
    assert.equal(
        await successService.apply(
            billing({
                eventId: 'm2:success',
                msgId: 'm2',
                payMode: 'postpaid',
                trigger: 'success',
                costUsd: 5
            })
        ),
        'applied'
    )
    assert.equal(successCache.state.balance, '45')
})

test('同一扣费事件只扣一次，重复事件不再访问 Redis', async () => {
    const box = fake({ exists: true })
    const cache = redis(90)
    const service = new SrmChargeService(box.dataSource, cache)
    assert.equal(await service.apply(billing()), 'duplicate')
    assert.equal(cache.increments.length, 0)
    assert.equal(box.deducts.length, 0)
})

test('扣费流水写入失败时回补 Redis 余额', async () => {
    const box = fake({ insertError: new Error('数据库不可用') })
    const cache = redis(100)
    const service = new SrmChargeService(box.dataSource, cache)
    await assert.rejects(() => service.apply(billing()), /数据库不可用/)
    assert.equal(cache.state.balance, '100')
    assert.deepEqual(
        cache.increments.map(item => item.increment),
        [-10, 10]
    )
})

test('无效触发节点不扣费，钱包不存在时不扣 Redis 余额', async () => {
    const invalidBox = fake()
    const invalidRedis = redis(100)
    const invalidService = new SrmChargeService(invalidBox.dataSource, invalidRedis)
    assert.equal(await invalidService.apply(billing({ trigger: 'delivered' })), 'invalid')
    assert.equal(invalidRedis.increments.length, 0)

    const missingWalletBox = fake({ wallet: null })
    const missingWalletRedis = redis(100)
    const missingWalletService = new SrmChargeService(missingWalletBox.dataSource, missingWalletRedis)
    await assert.rejects(() => missingWalletService.apply(billing()), /供应商钱包不存在/)
    assert.equal(missingWalletRedis.increments.length, 0)

    const missingBalanceBox = fake()
    const missingBalanceRedis = redis(100)
    delete missingBalanceRedis.state.balance
    const missingBalanceService = new SrmChargeService(missingBalanceBox.dataSource, missingBalanceRedis)
    await assert.rejects(() => missingBalanceService.apply(billing()), /Redis 余额缺失或格式错误/)
    assert.equal(missingBalanceRedis.increments.length, 0)
})
