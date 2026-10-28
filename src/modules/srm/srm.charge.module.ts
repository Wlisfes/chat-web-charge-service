import { Module } from '@nestjs/common'
import { SrmChargeConsumer } from '@/modules/srm/srm.charge.consumer'
import { SrmChargeController } from '@/modules/srm/srm.charge.controller'
import { SrmChargeService } from '@/modules/srm/srm.charge.service'

@Module({
    controllers: [SrmChargeController],
    providers: [SrmChargeService, SrmChargeConsumer],
    exports: [SrmChargeService]
})
export class SrmChargeModule {}
