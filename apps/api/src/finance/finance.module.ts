import { Module } from '@nestjs/common';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';
import { FinanceStoreService } from './finance-store.service';
import { PythonAkshareService } from './python-akshare.service';

@Module({
  controllers: [FinanceController],
  providers: [FinanceService, PythonAkshareService, FinanceStoreService]
})
export class FinanceModule {}
