import { Controller, Delete, Get, Inject, Param, Post, Query } from '@nestjs/common';
import { IndexService } from './index.service';
import { IndexMarket } from './index.types';

@Controller('indices')
export class IndexController {
  constructor(@Inject(IndexService) private readonly indices: IndexService) {}
  @Get() list(@Query('q') q='',@Query('market') market='all',@Query('refresh') refresh?:string) { return this.indices.list(q,market,refresh==='true'||refresh==='1'); }
  @Get('favorites') favorites() { return this.indices.favorites(); }
  @Post('favorites/:market/:symbol') save(@Param('market') market:IndexMarket,@Param('symbol') symbol:string) { return this.indices.saveFavorite(market,symbol); }
  @Delete('favorites/:market/:symbol') remove(@Param('market') market:IndexMarket,@Param('symbol') symbol:string) { return this.indices.removeFavorite(market,symbol); }
  @Get(':market/:symbol/valuation') valuation(@Param('market') market:IndexMarket,@Param('symbol') symbol:string,@Query('refresh') refresh?:string) { return this.indices.valuation(market,symbol,refresh==='true'||refresh==='1'); }
  @Get(':market/:symbol') detail(@Param('market') market:IndexMarket,@Param('symbol') symbol:string,@Query('years') years='10',@Query('refresh') refresh?:string) { return this.indices.detail(market,symbol,Number(years)||10,refresh==='true'||refresh==='1'); }
}
