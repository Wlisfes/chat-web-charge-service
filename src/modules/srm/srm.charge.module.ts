import { Module } from '@nestjs/common'
import { SrmChargeConsumer } from '@/modules/srm/srm.charge.consumer'
import { SrmChargeService } from '@/modules/srm/srm.charge.service'

@Module({
    providers: [SrmChargeService, SrmChargeConsumer],
    exports: [SrmChargeService]
})
export class SrmChargeModule {}
