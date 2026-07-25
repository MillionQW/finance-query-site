import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min
} from 'class-validator';
import { IndexMarket } from './index.types';

export class IndexListQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q = '';

  @IsOptional()
  @IsIn(['all', 'cn', 'bj', 'hk'])
  market: 'all' | IndexMarket = 'all';

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  refresh = false;
}

export class IndexIdentityDto {
  @IsIn(['cn', 'bj', 'hk'])
  market!: IndexMarket;

  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  symbol!: string;
}

export class IndexDetailQueryDto {
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(20)
  years = 10;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  refresh = false;
}

export class IndexRefreshQueryDto {
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  refresh = false;
}
