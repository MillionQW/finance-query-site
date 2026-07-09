import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';
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
