import { BadRequestException, Body, Controller, Get, Inject, Param, Post, Put, Query } from '@nestjs/common';
import { BusinessSyncService } from './business-sync.service';
import { FinanceStoreService } from './finance-store.service';
import { BusinessInputDto, HypothesisInputDto, ReviewInputDto } from './research-tracking.dto';
import { cleanResearchInput } from './research-tracking.validation';
import type { Market } from './types';
import type { ResearchKind } from './research-tracking.types';

@Controller('finance/research/:market/:symbol')
export class ResearchTrackingController {
  constructor(@Inject(FinanceStoreService) private readonly store: FinanceStoreService, @Inject(BusinessSyncService) private readonly businessSync: BusinessSyncService) {}
  private identity(p: Record<string, string>): [Market, string] {
    if (!['a','hk'].includes(p.market) || !new RegExp(`^\\d{1,${p.market === 'hk' ? 5 : 6}}$`).test(p.symbol)) throw new BadRequestException('市场或股票代码无效');
    return [p.market as Market, p.symbol.padStart(p.market === 'hk' ? 5 : 6, '0')];
  }
  @Get()
  list(@Param() p: Record<string,string>) { return this.store.researchTracking.list(...this.identity(p)); }
  @Post('business-sync')
  sync(@Param() p: Record<string,string>, @Query('refresh') refresh?: string) { return this.businessSync.sync(...this.identity(p), refresh === 'true'); }
  @Get(':kind/:id/history')
  history(@Param() p: Record<string,string>) {
    if (!['business','hypotheses'].includes(p.kind)) throw new BadRequestException('记录类型无效');
    return this.store.researchTracking.history(...this.identity(p), p.kind as ResearchKind, p.id);
  }
  @Post('business')
  createBusiness(@Param() p: Record<string,string>, @Body() body: BusinessInputDto) { return this.save(p, 'business', body); }
  @Put('business/:id')
  updateBusiness(@Param() p: Record<string,string>, @Body() body: BusinessInputDto) { return this.save(p, 'business', body); }
  @Post('hypotheses')
  createHypothesis(@Param() p: Record<string,string>, @Body() body: HypothesisInputDto) { return this.save(p, 'hypotheses', body); }
  @Put('hypotheses/:id')
  updateHypothesis(@Param() p: Record<string,string>, @Body() body: HypothesisInputDto) { return this.save(p, 'hypotheses', body); }
  private save(p: Record<string,string>, kind: ResearchKind, body: BusinessInputDto | HypothesisInputDto) {
    const { expectedVersion, ...data } = cleanResearchInput(body);
    return this.store.researchTracking.save(...this.identity(p), kind, p.id ?? null, expectedVersion, data);
  }
  @Post('hypotheses/:id/review')
  review(@Param() p: Record<string,string>, @Body() body: ReviewInputDto) { return this.store.researchTracking.review(...this.identity(p), p.id, body); }
}
