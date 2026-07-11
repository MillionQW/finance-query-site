import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class EtfListQueryDto {
  @IsOptional()
  @IsString()
  q = '';

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(200)
  limit = 80;

  @IsOptional()
  @IsIn(['amount', 'changePercent', 'marketCap', 'turnoverRate', 'premiumRate', 'symbol'])
  sort: 'amount' | 'changePercent' | 'marketCap' | 'turnoverRate' | 'premiumRate' | 'symbol' = 'amount';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  order: 'asc' | 'desc' = 'desc';

  @IsOptional()
  @IsIn(['all', 'sh', 'sz'])
  exchange: 'all' | 'sh' | 'sz' = 'all';

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  refresh = false;
}

export class EtfDetailQueryDto {
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(10)
  years = 10;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  refresh = false;
}
