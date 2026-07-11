import { Module } from '@nestjs/common';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';
import { FinanceRefreshService } from './finance-refresh.service';
import { FinanceStoreService } from './finance-store.service';
import { PythonAkshareService } from './python-akshare.service';
import { AnnouncementRefreshService } from './announcement-refresh.service';
import { EtfController } from './etf.controller';
import { EtfService } from './etf.service';

@Module({
  controllers: [FinanceController, EtfController],
  providers: [
    FinanceService,
    EtfService,
    FinanceRefreshService,
    AnnouncementRefreshService,
    PythonAkshareService,
    FinanceStoreService
  ]
})
export class FinanceModule {}
