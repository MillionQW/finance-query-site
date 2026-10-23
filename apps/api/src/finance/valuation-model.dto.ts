import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, Equals, IsArray, IsIn, IsInt, IsNumber, IsString, Matches, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';

export class ValuationScenarioDto {
  @IsString() @MinLength(1) @MaxLength(20) name!: string;
  @IsNumber() @Min(-95) @Max(100) growth!: number;
  @IsNumber() @Min(1) @Max(200) exitPe!: number;
  @IsNumber() @Min(0) @Max(100) payout!: number;
  @IsNumber() @Min(-20) @Max(100) shareChange!: number;
  @IsString() @MinLength(1) @MaxLength(4000) rationale!: string;
}
export class ValuationModelDto {
  @Equals(1) version!: 1;
  @IsNumber() @Min(0.000001) @Max(1e12) baseProfit!: number;
  @IsNumber() @Min(0.000001) @Max(1e12) shares!: number;
  @IsNumber() @Min(0.000001) @Max(1e9) price!: number;
  @Matches(/^[A-Z]{3}$/) reportCurrency!: string;
  @Matches(/^[A-Z]{3}$/) quoteCurrency!: string;
  @IsNumber() @Min(0.000001) @Max(1e6) fx!: number;
  @IsString() @MaxLength(10) fxDate!: string;
  @IsString() @MinLength(1) @MaxLength(120) basePeriod!: string;
  @IsString() @MinLength(1) @MaxLength(120) profitBasis!: string;
  @IsString() @MinLength(1) @MaxLength(2000) baseSource!: string;
  @IsString() @MaxLength(128) statementHash!: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) valuationDate!: string;
  @IsInt() @IsIn([3, 5]) years!: number;
  @IsNumber() @Min(0) @Max(100) requiredReturn!: number;
  @IsNumber() @Min(0) @Max(90) safetyMargin!: number;
  @IsArray() @ArrayMinSize(3) @ArrayMaxSize(3) @ValidateNested({ each: true }) @Type(() => ValuationScenarioDto)
  scenarios!: ValuationScenarioDto[];
}
export interface ValuationSnapshot { id: number; savedAt: string; model: ValuationModelDto }
