import { Controller, Get, Param, Query } from '@nestjs/common';
import { CatalogService } from './catalog.service';

@Controller()
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('store-config')
  storeConfig() {
    return this.catalog.getStoreConfig();
  }

  @Get('bundles')
  listBundles(
    @Query('country') country?: string,
    @Query('category') category?: string,
    @Query('sort') sort?: string,
    @Query('reloadable') reloadable?: string,
    @Query('q') q?: string,
  ) {
    return this.catalog.listPublicBundles({
      country,
      category,
      sort,
      reloadable,
      q,
    });
  }

  @Get('bundles/:id')
  getBundle(@Param('id') id: string) {
    return this.catalog.getPublicBundleById(id);
  }

  @Get('regions')
  listRegions() {
    return this.catalog.listRegionsForMobile();
  }

  @Get('packages')
  listPackages(@Query('region') region?: string, @Query('q') q?: string) {
    return this.catalog.listPackagesForMobile(region, q);
  }

  @Get('packages/:id')
  async getPackage(@Param('id') id: string) {
    const b = await this.catalog.getPublicBundleById(id);
    return {
      id: b.id,
      provider: 'yesim',
      providerCode: b.yesimPlanId,
      name: b.name,
      regionCode: b.countryCode,
      regionName: b.countryName,
      dataBytes: b.isUnlimited ? '-1' : String(Math.round((b.dataGb ?? 0) * 1024 * 1024 * 1024)),
      dataLabel: b.dataLabel,
      isUnlimited: b.isUnlimited,
      validityDays: b.validityDays,
      priceCents: b.pricePkr * 100,
      pricePkr: b.pricePkr,
      actualPricePkr: b.actualPricePkr,
      discountPct: b.discountPct,
      isMostPopular: b.isMostPopular,
      isReloadable: b.isReloadable,
      currency: 'PKR',
    };
  }

  @Get('compatibility/devices')
  devices() {
    return this.catalog.getDevices();
  }

  @Get('coverage/operators')
  operators(@Query('country') country?: string) {
    return this.catalog.getOperators(country);
  }
}
