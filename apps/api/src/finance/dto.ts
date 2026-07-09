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
  @Min(1)
  @Max(10)
  years = 10;

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
