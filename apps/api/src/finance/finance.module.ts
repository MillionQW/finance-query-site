import { Module } from '@nestjs/common';
import { ResearchTrackingController } from './research-tracking.controller';
import { BusinessSyncService } from './business-sync.service';
import { ValuationModelController } from './valuation-model.controller';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';
import { FinanceRefreshService } from './finance-refresh.service';
import { FinanceStoreService } from './finance-store.service';
import { PythonAkshareService } from './python-akshare.service';
import { AnnouncementRefreshService } from './announcement-refresh.service';
import { EtfController } from './etf.controller';
import { EtfService } from './etf.service';
import { IndexController } from './index.controller';
import { IndexService } from './index.service';
import { IndexStoreService } from './index-store.service';
import { CompanyValuationController } from './company-valuation.controller';
import { CompanyValuationService } from './company-valuation.service';

@Module({
  controllers: [FinanceController, EtfController, IndexController, CompanyValuationController, ValuationModelController, ResearchTrackingController],
  providers: [
    BusinessSyncService,
    FinanceService,
    CompanyValuationService,
    EtfService,
    IndexService,
    IndexStoreService,
    FinanceRefreshService,
    AnnouncementRefreshService,
    PythonAkshareService,
    FinanceStoreService
  ]
})
export class FinanceModule {}
