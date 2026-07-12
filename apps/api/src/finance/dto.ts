import { IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { Transform } from 'class-transformer';

export type Market = 'all' | 'a' | 'hk';
export type StatementType = 'balance' | 'income' | 'cashflow';

export class SearchCompaniesDto {
  @IsString()
  @IsNotEmpty()
  q!: string;

  @IsOptional()
  @IsIn(['all', 'a', 'hk'])
  market: Market = 'all';
}

export class StatementQueryDto {
  @IsIn(['a', 'hk'])
  market!: Exclude<Market, 'all'>;

  @IsString()
  @IsNotEmpty()
  symbol!: string;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(0)
  @Max(200)
  years = 0;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  refresh = false;
}

export class PeerQueryDto {
  @IsIn(['a', 'hk'])
  market!: Exclude<Market, 'all'>;

  @IsString()
  @IsNotEmpty()
  symbol!: string;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(5)
  @Max(50)
  limit = 20;
}

export class PeerMetricQueryDto extends PeerQueryDto {
  @IsOptional()
  @IsString()
  metricKey = 'revenue';
}

export class MetricComparisonQueryDto {
  @IsOptional()
  @IsString()
  metricKey = 'revenue';

  @IsString()
  @IsNotEmpty()
  companies!: string;
}

export class FavoriteCompanyDto {
  @IsIn(['a', 'hk'])
  market!: Exclude<Market, 'all'>;

  @IsString()
  @IsNotEmpty()
  symbol!: string;

  @IsString()
  @IsNotEmpty()
  displaySymbol!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  source = 'favorite';

  @IsOptional()
  @Transform(({ value }) => value === null || value === undefined || value === '' ? null : Number(value))
  @IsNumber()
  latestPrice?: number | null;

  @IsOptional()
  @Transform(({ value }) => value === null || value === undefined || value === '' ? null : Number(value))
  @IsNumber()
  changePercent?: number | null;
}

export class FavoriteIdentityDto {
  @IsIn(['a', 'hk'])
  market!: Exclude<Market, 'all'>;

  @IsString()
  @IsNotEmpty()
  symbol!: string;
}
