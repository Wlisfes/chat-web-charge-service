const test = require('node:test')
const assert = require('node:assert/strict')
const { SrmChargeService } = require('../dist/modules/srm/srm.charge.service')

function fake(balance = 0, exists = false) {
    const bills = []
    const dataSource = {
        getRepository: () => ({ findOne: async () => (balance === undefined ? null : { balanceUsd: balance, payMode: 'prepaid' }) }),
        transaction: async work => work(dataSource)
    }
    dataSource.getRepository = () => ({
        findOne: async () => ({ balanceUsd: balance }),
        findOneOrFail: async () => ({ balanceUsd: balance - 10 }),
        exists: async () => exists,
        insert: async row => bills.push(row)
    })
    dataSource.createQueryBuilder = () => {
        const builder = {
            insert: () => builder,
            update: () => builder,
            into: () => builder,
            values: () => builder,
            orIgnore: () => builder,
            updateEntity: () => builder,
            set: () => builder,
            where: () => builder,
            execute: async () => ({})
        }
        return builder
    }
    return { dataSource, bills, service: new SrmChargeService(dataSource) }
}

test('预付余额小于等于 0 不能发，后付可以发', async () => {
    const empty = fake(0)
    assert.equal((await empty.service.canSend(1, 'prepaid')).allowed, false)
    assert.equal((await empty.service.canSend(1, 'postpaid')).allowed, true)
    const funded = fake(100)
    assert.equal((await funded.service.canSend(1, 'prepaid')).allowed, true)
})

test('成功和已送达都扣费，同一短信只扣一次', async () => {
    const first = fake(100, false)
    const applied = await first.service.apply({
        eventId: 'm1',
        msgId: 'm1',
        userKeyId: 1,
        payMode: 'postpaid',
        trigger: 'success',
        costUsd: 10,
        occurredTime: new Date().toISOString(),
        segments: 1,
        simbankKeyId: 2,
        portKeyId: 3
    })
    assert.equal(applied, 'applied')
    assert.equal(first.bills.length, 1)
    const again = fake(90, true)
    assert.equal(
        await again.service.apply({
            eventId: 'm1',
            msgId: 'm1',
            userKeyId: 1,
            payMode: 'prepaid',
            trigger: 'delivered',
            costUsd: 10,
            occurredTime: new Date().toISOString()
        }),
        'duplicate'
    )
})

test('提交节点的旧事件不扣费', async () => {
    const box = fake(100, false)
    assert.equal(
        await box.service.apply({
            eventId: 'm1:submitted',
            msgId: 'm1',
            userKeyId: 1,
            payMode: 'prepaid',
            trigger: 'submitted',
            costUsd: 10,
            occurredTime: new Date().toISOString()
        }),
        'invalid'
    )
})
