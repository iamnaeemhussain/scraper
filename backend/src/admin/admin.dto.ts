import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class UpsertBundleDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsNumber()
  @Min(1)
  pricePkr!: number;

  @IsOptional()
  @IsNumber()
  actualPricePkr?: number | null;

  @IsOptional()
  @IsNumber()
  discountPct?: number | null;

  @IsOptional()
  @IsNumber()
  priceDifferencePkr?: number | null;

  @IsOptional()
  @IsNumber()
  costPkr?: number | null;

  @IsOptional()
  @IsNumber()
  costEur?: number | null;

  @IsOptional()
  @IsNumber()
  commissionPkr?: number | null;

  @IsOptional()
  @IsNumber()
  eurToPkr?: number | null;

  @IsString()
  dataLabel!: string;

  @IsOptional()
  @IsNumber()
  dataGb?: number | null;

  @IsOptional()
  @IsBoolean()
  isUnlimited?: boolean;

  @IsInt()
  @Min(1)
  @Max(3650)
  validityDays!: number;

  @IsOptional()
  @IsBoolean()
  isReloadable?: boolean;

  @IsOptional()
  @IsBoolean()
  isMostPopular?: boolean;

  @IsOptional()
  @IsString()
  countryCode?: string;

  @IsOptional()
  @IsString()
  countryName?: string;

  @IsOptional()
  @IsString()
  coverageType?: string;

  @IsOptional()
  @IsString()
  planType?: string;

  @IsOptional()
  @IsBoolean()
  hotspotAllowed?: boolean;

  @IsOptional()
  @IsString()
  activationType?: string;

  @IsOptional()
  @IsString()
  operators?: string | null;

  @IsString()
  yesimPlanId!: string;

  @IsOptional()
  @IsString()
  contact?: string | null;

  @IsOptional()
  @IsString()
  message?: string | null;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateStoreSettingsDto {
  @IsOptional()
  @IsString()
  storeName?: string;

  @IsOptional()
  @IsString()
  tagline?: string;

  @IsOptional()
  @IsString()
  announcementTicker?: string;

  @IsOptional()
  @IsString()
  whatsappNumber?: string;

  @IsOptional()
  @IsString()
  supportEmail?: string;

  @IsOptional()
  @IsNumber()
  defaultEurToPkr?: number;

  @IsOptional()
  @IsString()
  coverageEmbedUrl?: string;

  @IsOptional()
  @IsString()
  yesimBaseUrl?: string;

  @IsOptional()
  @IsString()
  yesimApiToken?: string;

  @IsOptional()
  @IsBoolean()
  yesimMockMode?: boolean;

  @IsOptional()
  @IsString()
  dpayBaseUrl?: string;

  @IsOptional()
  @IsString()
  dpayApiKey?: string;

  @IsOptional()
  @IsString()
  dpayWebhookSecret?: string;

  @IsOptional()
  @IsBoolean()
  dpayMockMode?: boolean;
}
