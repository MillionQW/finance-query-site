import { IsBoolean, IsIn, IsInt, IsNumber, IsString, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';

export class MetricIdentityDto {
  @IsIn(['业务','产品','地区','渠道','整体']) dimension!: string;
  @IsString() @MinLength(1) @MaxLength(100) segment!: string;
  @IsString() @MinLength(1) @MaxLength(100) metric!: string;
  @IsString() @MinLength(1) @MaxLength(30) unit!: string;
  @IsString() @MaxLength(3) currency!: string;
  @IsString() @MinLength(1) @MaxLength(200) basis!: string;
  @IsString() @MaxLength(10) periodStart!: string;
  @IsString() @MaxLength(10) periodEnd!: string;
  @IsBoolean() archived!: boolean;
  @IsInt() @Min(0) expectedVersion!: number;
}
export class BusinessInputDto extends MetricIdentityDto {
  @IsNumber() @Min(-1e15) @Max(1e15) value!: number;
  @IsString() @MinLength(1) @MaxLength(2000) sourceText!: string;
  @IsString() @MaxLength(2000) sourceUrl!: string;
  @IsString() @MaxLength(100) page!: string;
  @IsString() @MaxLength(4000) note!: string;
}
export class HypothesisInputDto extends MetricIdentityDto {
  @IsString() @MinLength(1) @MaxLength(1000) thesis!: string;
  @IsString() @MinLength(1) @MaxLength(4000) rationale!: string;
  @ValidateIf((_o, v) => v !== null) @IsNumber() @Min(-1e15) @Max(1e15) expectedMin!: number | null;
  @ValidateIf((_o, v) => v !== null) @IsNumber() @Min(-1e15) @Max(1e15) expectedMax!: number | null;
  @IsString() @MaxLength(10) dueDate!: string;
  @ValidateIf((_o, v) => v !== null) @IsInt() @Min(1) valuationSnapshotId!: number | null;
}
export class ReviewInputDto {
  @IsInt() @Min(1) expectedVersion!: number;
  @IsString() @MinLength(1) @MaxLength(4000) note!: string;
  @IsString() @MinLength(1) @MaxLength(4000) valuationImpact!: string;
  @IsString() @MinLength(1) @MaxLength(36) businessId!: string;
  @IsInt() @Min(1) businessVersion!: number;
}
