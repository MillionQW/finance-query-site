import { Controller, Delete, Get, Inject, Param, Post, Query } from '@nestjs/common';
import {
  IndexDetailQueryDto,
  IndexIdentityDto,
  IndexListQueryDto,
  IndexRefreshQueryDto
} from './index.dto';
import { IndexService } from './index.service';

@Controller('indices')
export class IndexController {
  constructor(@Inject(IndexService) private readonly indices: IndexService) {}

  @Get()
  list(@Query() query: IndexListQueryDto) {
    return this.indices.list(query.q, query.market, query.refresh);
  }

  @Get('favorites')
  favorites() {
    return this.indices.favorites();
  }

  @Post('favorites/:market/:symbol')
  save(@Param() params: IndexIdentityDto) {
    return this.indices.saveFavorite(params.market, params.symbol);
  }

  @Delete('favorites/:market/:symbol')
  remove(@Param() params: IndexIdentityDto) {
    return this.indices.removeFavorite(params.market, params.symbol);
  }

  @Get(':market/:symbol/valuation')
  valuation(@Param() params: IndexIdentityDto, @Query() query: IndexRefreshQueryDto) {
    return this.indices.valuation(params.market, params.symbol, query.refresh);
  }

  @Get(':market/:symbol')
  detail(@Param() params: IndexIdentityDto, @Query() query: IndexDetailQueryDto) {
    return this.indices.detail(params.market, params.symbol, query.years, query.refresh);
  }
}
