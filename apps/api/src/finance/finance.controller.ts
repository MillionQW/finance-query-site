import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { FinanceService } from './finance.service';
import { FinanceRefreshService } from './finance-refresh.service';
import { AnnouncementRefreshService } from './announcement-refresh.service';
import {
  FavoriteCompanyDto,
  FavoriteIdentityDto,
  MetricComparisonQueryDto,
  PeerMetricQueryDto,
  PeerQueryDto,
  SearchCompaniesDto,
  StatementQueryDto
} from './dto';

@Controller()
export class FinanceController {
  constructor(
    private readonly finance: FinanceService,
    private readonly refresh: FinanceRefreshService,
    private readonly announcements: AnnouncementRefreshService
  ) {}

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
      query.years ?? 0,
      query.refresh ?? false
    );
  }

  @Get('finance/peers')
  getPeerComparison(@Query() query: PeerQueryDto) {
    return this.finance.getPeerComparison(
      query.market,
      query.symbol.trim(),
      query.limit ?? 20
    );
  }

  @Get('finance/peer-metrics')
  getPeerMetricComparison(@Query() query: PeerMetricQueryDto) {
    return this.finance.getPeerMetricComparison(
      query.market,
      query.symbol.trim(),
      query.metricKey.trim(),
      query.limit ?? 20
    );
  }

  @Get('finance/metric-comparison')
  getMetricComparison(@Query() query: MetricComparisonQueryDto) {
    return this.finance.getMetricComparison(
      query.companies,
      query.metricKey.trim()
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

  @Get('finance/announcements')
  getAnnouncements(@Query() query: StatementQueryDto) {
    return this.announcements.getFeed(query.market, query.symbol.trim(), 100);
  }

  @Post('finance/announcements/:market/:symbol/viewed')
  markAnnouncementsViewed(@Param() params: FavoriteIdentityDto) {
    return this.announcements.markViewed(params.market, params.symbol);
  }

  @Get('cache/stats')
  getCacheStats() {
    return this.finance.getCacheStats();
  }

  @Get('cache/entries')
  getCacheEntries() {
    return this.finance.getCacheEntries();
  }

  @Get('cache/refresh-status')
  getRefreshStatus() {
    return this.refresh.getStatus();
  }

  @Post('cache/refresh')
  refreshStatements() {
    return this.refresh.triggerManualRefresh();
  }
}
