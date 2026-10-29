import { Injectable } from '@nestjs/common'
import { InjectDataSource, DataSource } from '@wlisfes/chat-web-base-schema/database'
import { RabbitmqService } from '@wlisfes/chat-web-base-schema/rabbitmq'
import { RedisService } from '@wlisfes/chat-web-base-schema/redis'
import * as HealthDto from '@/health/dto/health.dto'

type TableRow = { tableName: string }

@Injectable()
export class HealthService {
    constructor(
        private readonly rabbitmqService: RabbitmqService,
        private readonly redisService: RedisService,
        @InjectDataSource() private readonly dataSource: DataSource
    ) {}

    public async getLiveness(): Promise<HealthDto.ServiceLivenessResponseDto> {
        return { status: 'UP', timestamp: new Date().toISOString() }
    }

    /** 扣费依赖 RabbitMQ、数据库和 Redis，任一未就绪时不接收扣费消息。 */
    public async getReadiness(): Promise<HealthDto.ServiceReadinessResponseDto> {
        const rabbitmqConnected = this.rabbitmqService.isReady()
        const database = await this.databaseStatus()
        const databaseReady = database.connected === true && (database.missingTables?.length ?? 0) === 0
        const redis = await this.redisStatus()
        return {
            status: rabbitmqConnected && databaseReady && redis.connected ? 'UP' : 'DOWN',
            rabbitmq: { connected: rabbitmqConnected },
            database,
            redis,
            auth: { mode: 'gateway-principal' },
            timestamp: new Date().toISOString()
        }
    }

    /** 检查共享供应商钱包 Redis 是否可读写。 */
    private async redisStatus(): Promise<HealthDto.ServiceDependencyResponseDto> {
        try {
            return { connected: await this.redisService.ping() }
        } catch (error) {
            return { connected: false, error: error instanceof Error ? error.message : String(error) }
        }
    }

    private async databaseStatus(): Promise<HealthDto.ServiceDependencyResponseDto> {
        const requiredTables = [...new Set(this.dataSource.entityMetadatas.map(metadata => metadata.tableName))].sort()
        try {
            if (requiredTables.length === 0) {
                await this.dataSource.query('SELECT 1')
                return { connected: this.dataSource.isInitialized, requiredTableCount: 0, missingTables: [] }
            }
            const rows = (await this.dataSource.query(
                `SELECT table_name AS tableName FROM information_schema.tables
                 WHERE table_schema = DATABASE() AND table_name IN (${requiredTables.map(() => '?').join(', ')})`,
                requiredTables
            )) as TableRow[]
            const existing = new Set(rows.map(row => row.tableName))
            const missingTables = requiredTables.filter(table => !existing.has(table))
            return { connected: this.dataSource.isInitialized, requiredTableCount: requiredTables.length, missingTables }
        } catch (error) {
            return { connected: false, error: error instanceof Error ? error.message : String(error) }
        }
    }
}
