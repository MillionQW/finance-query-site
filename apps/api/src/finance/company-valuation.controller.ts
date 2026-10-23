import { Controller, Get, Inject, Query } from '@nestjs/common';
import { StatementQueryDto } from './dto';
import { CompanyValuationService } from './company-valuation.service';

@Controller('finance/company-valuation')
export class CompanyValuationController {
  constructor(@Inject(CompanyValuationService) private readonly valuation: CompanyValuationService) {}

  @Get()
  get(@Query() query: StatementQueryDto) {
    return this.valuation.get(query.market, query.symbol, query.refresh);
  }
}
