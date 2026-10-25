import { Body, Controller, Delete, Get, Inject, Param, Post, Put, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { FinanceService } from './finance.service';
import { FinanceRefreshService } from './finance-refresh.service';
import { AnnouncementRefreshService } from './announcement-refresh.service';
import {
  FavoriteCompanyDto,
  FavoriteIdentityDto,
  CompanyInsightDto,
  MetricComparisonQueryDto,
  PeerMetricQueryDto,
  PeerQueryDto,
  ScreenerQueryDto,
  SearchCompaniesDto,
  StatementQueryDto
} from './dto';

@Controller()
export class FinanceController {
  constructor(
    @Inject(FinanceService) private readonly finance: FinanceService,
    @Inject(FinanceRefreshService) private readonly refresh: FinanceRefreshService,
    @Inject(AnnouncementRefreshService) private readonly announcements: AnnouncementRefreshService
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
  async searchCompanies(@Query() query: SearchCompaniesDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const controller = new AbortController();
    const cancel = () => controller.abort();
    res.on('close', cancel);
    try {
      if (req.aborted) controller.abort();
      return await this.finance.searchCompanies(query.q.trim(), query.market ?? 'all', query.source, controller.signal);
    } finally {
      res.off('close', cancel);
    }
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

  @Get('finance/screener')
  screenCompanies(@Query() query: ScreenerQueryDto) {
    return this.finance.screenCompanies({
      markets: query.markets,
      scope: query.scope,
      minRoa: query.minRoa,
      maxPe: query.maxPe,
      minMarketCapBillion: query.minMarketCapBillion,
      limit: query.limit,
      maxCandidates: query.maxCandidates,
      requestGapMs: query.requestGapMs,
      latestPeriod: query.latestPeriod,
      peOnly: query.peOnly,
      excludeBanks: query.excludeBanks,
      refresh: query.refresh
    });
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

  @Get('finance/insights/:market/:symbol')
  getCompanyInsight(@Param() params: FavoriteIdentityDto) {
    return this.finance.getCompanyInsight(params.market, params.symbol);
  }

  @Put('finance/insights/:market/:symbol')
  saveCompanyInsight(@Param() params: FavoriteIdentityDto, @Body() body: CompanyInsightDto) {
    return this.finance.saveCompanyInsight(params.market, params.symbol, body);
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
