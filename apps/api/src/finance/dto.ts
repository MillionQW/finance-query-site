import { IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Transform } from 'class-transformer';

export type Market = 'all' | 'a' | 'hk';
export type StatementType = 'balance' | 'income' | 'cashflow';

export class SearchCompaniesDto {
  @IsOptional()
  @IsIn(['local', 'sz', 'sh', 'star', 'bj', 'hk'])
  source?: 'local' | 'sz' | 'sh' | 'star' | 'bj' | 'hk';

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

export class ScreenerQueryDto {
  @IsOptional()
  @IsString()
  markets = 'all';

  @IsOptional()
  @IsString()
  scope = 'all';

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0)
  @Max(100)
  minRoa = 25;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0)
  @Max(200)
  maxPe = 16;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0)
  @Max(100000)
  minMarketCapBillion = 0;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(300)
  limit = 80;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(800)
  maxCandidates = 30;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(0)
  @Max(10000)
  requestGapMs = 1000;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  latestPeriod = false;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  peOnly = true;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  excludeBanks = true;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  refresh = false;
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

export class CompanyInsightDto {
  @IsString()
  @MaxLength(10000)
  note = '';

  @IsString()
  @MaxLength(10000)
  thesis = '';

  @IsString()
  @MaxLength(10000)
  risks = '';

  @IsString()
  @MaxLength(10000)
  catalysts = '';

  @IsString()
  @MaxLength(10000)
  questions = '';

  @IsString()
  @MaxLength(200)
  buyPointRange = '';
}
