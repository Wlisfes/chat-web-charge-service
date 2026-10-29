'use strict'

/** 部署前准备 Charge Nacos 配置。已有配置只校验，不覆盖人工修改。 */

function required(name, environment = process.env) {
    const value = environment[name]
    if (typeof value !== 'string' || !value.trim()) throw new Error(`缺少环境变量：${name}`)
    return value.trim()
}

function scalar(value) {
    return JSON.stringify(value)
}

function getBaseUrl(environment = process.env) {
    const server = required('NACOS_SERVER', environment)
    return (/^https?:\/\//i.test(server) ? server : `http://${server}`).replace(/\/$/, '')
}

async function getNacosAccessToken(environment = process.env) {
    const username = environment.NACOS_USERNAME?.trim()
    const password = environment.NACOS_PASSWORD
    if (!username || password === undefined) return undefined
    const response = await fetch(`${getBaseUrl(environment)}/nacos/v1/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ username, password })
    })
    if (!response.ok) throw new Error(`Nacos 鉴权失败：HTTP ${response.status}`)
    const result = await response.json()
    if (typeof result.accessToken !== 'string' || !result.accessToken.trim()) throw new Error('Nacos 鉴权响应缺少 accessToken')
    return result.accessToken
}

async function configUrl(dataId, environment = process.env) {
    const parameters = new URLSearchParams({
        dataId,
        group: environment.NACOS_CONFIG_GROUP?.trim() || 'DEFAULT_GROUP',
        tenant: environment.NACOS_NAMESPACE?.trim() || 'public'
    })
    const accessToken = await getNacosAccessToken(environment)
    if (accessToken) parameters.set('accessToken', accessToken)
    return `${getBaseUrl(environment)}/nacos/v1/cs/configs?${parameters}`
}

async function readConfig(dataId, environment = process.env) {
    const response = await fetch(await configUrl(dataId, environment))
    if (response.status === 404) return undefined
    if (!response.ok) throw new Error(`读取 Nacos 配置失败：${dataId} HTTP ${response.status}`)
    const content = await response.text()
    return content.trim() ? content.replace(/\r\n?/g, '\n') : undefined
}

async function writeConfig(dataId, content, environment = process.env) {
    const response = await fetch(await configUrl(dataId, environment), {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ content, type: 'yaml' })
    })
    if (!response.ok) throw new Error(`写入 Nacos 配置失败：${dataId} HTTP ${response.status}`)
}

function topLevelBlock(content, name) {
    const lines = content.replace(/\r\n?/g, '\n').split('\n')
    const start = lines.findIndex(line => line === `${name}:`)
    if (start < 0) return undefined
    let end = lines.findIndex((line, index) => index > start && line.trim() && !line.startsWith(' ') && !line.startsWith('#'))
    if (end < 0) end = lines.length
    return lines.slice(start, end).join('\n').trimEnd()
}

function createChargeConfig(source, environment = process.env) {
    const gateway = topLevelBlock(source, 'gateway')
    const redis = topLevelBlock(source, 'redis')
    if (!gateway) throw new Error('来源 Nacos 配置缺少 gateway，无法生成 Charge 配置')
    if (!redis) throw new Error('来源 Nacos 配置缺少 redis，无法生成 Charge 配置')
    const username = environment.CHARGE_MYSQL_USERNAME?.trim() || 'chat_web_charge_service'
    const password = required('CHARGE_MYSQL_PASSWORD', environment)
    return `# 服务监听配置。
server:
  port: 5120

# 服务间调用与网关身份上下文验签配置；从现有服务复制，必须与 Gateway 保持一致。
${gateway}

# 与 Finance 共用供应商钱包 Redis；database 必须固定为 3。
${redis}

# 读写 Finance 供应商钱包和扣费流水；余额由 Redis 维护。
database:
  chat-web-finance:
    host: ${scalar(environment.CHARGE_MYSQL_HOST?.trim() || 'mysql')}
    port: ${Number(environment.CHARGE_MYSQL_PORT || 3306)}
    database: "chat-web-finance"
    username: ${scalar(username)}
    password: ${scalar(password)}
    charset: "utf8mb4"
    timezone: "+08:00"

# 消费 /chat-sms 上的供应商扣费队列。
rabbitmq:
  host: ${scalar(environment.CHARGE_RABBIT_HOST?.trim() || 'chat-web-rabbitmq')}
  port: 5672
  vhost: /chat-sms
  username: ${scalar(username)}
  password: ${scalar(password)}
  prefetch: 10
`
}

function validateChargeConfig(content) {
    if (!/^\s+port:\s*5120\s*$/m.test(content)) throw new Error('Charge Nacos 配置缺少 server.port: 5120')
    const redis = topLevelBlock(content, 'redis')
    if (!redis) throw new Error('Charge Nacos 配置缺少 redis')
    if (!/^\s{2}database:\s*3\s*$/m.test(redis)) throw new Error('Charge Redis database 必须为 3')
    if (!content.includes('chat-web-finance:')) throw new Error('Charge Nacos 配置缺少 database.chat-web-finance')
    if (!content.includes('/chat-sms')) throw new Error('Charge RabbitMQ vhost 必须为 /chat-sms')
    if (!content.includes('service_token:') || !content.includes('secret:')) throw new Error('Charge Nacos 配置缺少网关凭据')
    return content
}

async function ensureChargeConfig(environment = process.env) {
    const dataId = environment.NACOS_CONFIG_DATA_ID?.trim() || 'chat-web-charge-service.yaml'
    const existing = await readConfig(dataId, environment)
    if (existing) {
        validateChargeConfig(existing)
        return false
    }
    const source = await readConfig('chat-web-finance-service.yaml', environment)
    if (!source) throw new Error('未找到 chat-web-finance-service.yaml，无法复制网关配置')
    await writeConfig(dataId, validateChargeConfig(createChargeConfig(source, environment)), environment)
    return true
}

async function main() {
    const created = await ensureChargeConfig()
    process.stdout.write(created ? 'Charge Nacos 配置已创建\n' : 'Charge Nacos 配置已存在且校验通过\n')
}

if (require.main === module) {
    main().catch(error => {
        process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
        process.exitCode = 1
    })
}

module.exports = { createChargeConfig, validateChargeConfig }
