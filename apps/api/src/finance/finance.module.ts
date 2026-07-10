import { Module } from '@nestjs/common';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';
import { FinanceRefreshService } from './finance-refresh.service';
import { FinanceStoreService } from './finance-store.service';
import { PythonAkshareService } from './python-akshare.service';

@Module({
  controllers: [FinanceController],
  providers: [FinanceService, FinanceRefreshService, PythonAkshareService, FinanceStoreService]
})
export class FinanceModule {}
