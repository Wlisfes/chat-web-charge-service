import { Injectable } from '@nestjs/common'

@Injectable()
export class AppService {
    public async httpBaseChargeResolverService(): Promise<string> {
        return 'Chat Web Charge Service'
    }
}
