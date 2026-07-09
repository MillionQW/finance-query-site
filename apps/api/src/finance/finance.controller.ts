import { Controller, Get, Query } from '@nestjs/common';
import { FinanceService } from './finance.service';
import { SearchCompaniesDto, StatementQueryDto } from './dto';

@Controller()
export class FinanceController {
  constructor(private readonly finance: FinanceService) {}

  @Get('health')
  health() {
    return {
      ok: true,
      service: 'finance-query-api',
      time: new Date().toISOString()
    };
  }

  @Get('companies/search')
  searchCompanies(@Query() query: SearchCompaniesDto) {
    return this.finance.searchCompanies(query.q.trim(), query.market ?? 'all');
  }

  @Get('finance/statements')
  getStatements(@Query() query: StatementQueryDto) {
    return this.finance.getStatements(
      query.market,
      query.symbol.trim(),
      query.years ?? 10,
      query.refresh ?? false
    );
  }

  @Get('cache/stats')
  getCacheStats() {
    return this.finance.getCacheStats();
  }
}
