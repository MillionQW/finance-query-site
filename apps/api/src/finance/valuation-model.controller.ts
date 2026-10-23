import { BadRequestException, Body, Controller, Get, Inject, Param, Post } from '@nestjs/common';
import { FinanceStoreService } from './finance-store.service';
import { FavoriteIdentityDto } from './dto';
import { ValuationModelDto } from './valuation-model.dto';

export function validateModelSemantics(model: ValuationModelDto): void {
  const validDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
  if (!validDate(model.valuationDate) || (model.reportCurrency !== model.quoteCurrency && !validDate(model.fxDate))) throw new BadRequestException('估值日期或汇率日期无效');
  if ([model.basePeriod, model.profitBasis, model.baseSource, ...model.scenarios.map(s => s.rationale)].some(s => !s.trim())) throw new BadRequestException('期间、口径、来源和假设依据不可为空');
  if (model.reportCurrency === model.quoteCurrency && model.fx !== 1) throw new BadRequestException('同币种汇率必须为1');
}

@Controller('finance/valuation-models/:market/:symbol')
export class ValuationModelController {
  constructor(@Inject(FinanceStoreService) private readonly store: FinanceStoreService) {}
  private identity(params: FavoriteIdentityDto) {
    const digits = params.market === 'hk' ? 5 : 6;
    if (!new RegExp(`^\\d{1,${digits}}$`).test(params.symbol)) throw new BadRequestException('股票代码格式不正确');
    return params.symbol.padStart(digits, '0');
  }
  @Get()
  list(@Param() params: FavoriteIdentityDto) { return this.store.listValuationModels(params.market, this.identity(params)); }
  @Post()
  save(@Param() params: FavoriteIdentityDto, @Body() model: ValuationModelDto) {
    validateModelSemantics(model);
    return this.store.saveValuationModel(params.market, this.identity(params), model);
  }
}
