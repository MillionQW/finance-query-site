import { Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { EtfDetailQueryDto, EtfListQueryDto } from './etf.dto';
import { EtfService } from './etf.service';

@Controller('etfs')
export class EtfController {
  constructor(private readonly etfs: EtfService) {}

  @Get()
  list(@Query() query: EtfListQueryDto) {
    return this.etfs.list(query);
  }

  @Get('favorites')
  favorites() {
    return this.etfs.getFavorites();
  }

  @Post('favorites/:symbol')
  saveFavorite(@Param('symbol') symbol: string) {
    return this.etfs.saveFavorite(symbol);
  }

  @Delete('favorites/:symbol')
  removeFavorite(@Param('symbol') symbol: string) {
    return this.etfs.removeFavorite(symbol);
  }

  @Get(':symbol/valuation')
  valuation(@Param('symbol') symbol: string, @Query('refresh') refresh?: string) {
    return this.etfs.getValuation(symbol, refresh === 'true' || refresh === '1');
  }

  @Get(':symbol')
  detail(@Param('symbol') symbol: string, @Query() query: EtfDetailQueryDto) {
    return this.etfs.getDetail(symbol, query.years, query.refresh);
  }
}
