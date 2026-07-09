import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { FinanceService } from './finance.service';
import { FavoriteCompanyDto, FavoriteIdentityDto, SearchCompaniesDto, StatementQueryDto } from './dto';

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

  @Get('favorites')
  getFavorites() {
    return this.finance.getFavorites();
  }

  @Post('favorites')
  saveFavorite(@Body() body: FavoriteCompanyDto) {
    return this.finance.saveFavorite(body);
  }

  @Delete('favorites/:market/:symbol')
  removeFavorite(@Param() params: FavoriteIdentityDto) {
    return this.finance.removeFavorite(params.market, params.symbol);
  }

  @Get('cache/stats')
  getCacheStats() {
    return this.finance.getCacheStats();
  }
}
