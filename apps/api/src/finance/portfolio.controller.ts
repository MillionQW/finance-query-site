import { Body, Controller, Delete, Get, Inject, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import { FinanceStoreService } from './finance-store.service';
import { PortfolioService } from './portfolio.service';
import { cleanHolding, holdingIdentity } from './portfolio.validation';

@Controller('portfolio')
export class PortfolioController {
  constructor(@Inject(FinanceStoreService) private readonly store: FinanceStoreService,
    @Inject(PortfolioService) private readonly service: PortfolioService) {}
  @Get()
  list() { return this.store.portfolio.list(); }
  @Post()
  add(@Body() body: unknown) { return this.store.portfolio.save(null, cleanHolding(body)); }
  @Put(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: unknown) { return this.store.portfolio.save(id, cleanHolding(body)); }
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Query('version', ParseIntPipe) version: number) { return this.store.portfolio.remove(id, version); }
  @Get('quote/:market/:symbol')
  quote(@Param('market') market: string, @Param('symbol') symbol: string, @Query('refresh') refresh?: string) {
    if (!(market === 'index' && symbol === '000300') && !(market === 'fx' && symbol === 'HKDCNY')) holdingIdentity(market, symbol);
    return this.service.quote(market, symbol, refresh === 'true');
  }
}
