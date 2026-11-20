import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AdminGuard } from '../auth/admin.guard';
import { YesimService } from '../yesim/yesim.service';
import { UpdateStoreSettingsDto, UpsertBundleDto } from './admin.dto';
import { AdminService } from './admin.service';

@Controller('admin')
@UseGuards(AuthGuard('jwt'), AdminGuard)
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly yesim: YesimService,
  ) {}

  @Get('dashboard')
  dashboard() {
    return this.admin.getDashboard();
  }

  // ===== Manual Bundle Management =====
  @Get('bundles')
  listBundles() {
    return this.admin.listAllBundles();
  }

  @Post('bundles')
  createBundle(@Body() dto: UpsertBundleDto) {
    return this.admin.createBundle(dto);
  }

  @Patch('bundles/:id')
  updateBundle(@Param('id') id: string, @Body() dto: Partial<UpsertBundleDto>) {
    return this.admin.updateBundle(id, dto);
  }

  @Delete('bundles/:id')
  deleteBundle(@Param('id') id: string) {
    return this.admin.deleteBundle(id);
  }

  @Post('bundles/recalculate-fx')
  recalculateFx(@Body() body: { eurToPkr: number }) {
    return this.admin.recalculateFx(Number(body.eurToPkr));
  }

  @Post('bundles/import-reference-sheet')
  importReferenceSheet() {
    return this.admin.importReferenceSheetBundles();
  }

  // ===== Yesim Partner Catalog & Balance =====
  @Get('yesim/plans')
  yesimPlans(
    @Query('filter') filter?: 'country' | 'region',
    @Query('forceRefresh') forceRefresh?: string,
  ) {
    return this.yesim.listPlans({
      filter,
      forceRefresh: forceRefresh === 'true',
    });
  }

  @Get('yesim/balance')
  yesimBalance() {
    return this.yesim.getBalance();
  }

  @Get('yesim/orders')
  yesimOrders(@Query('search') search?: string) {
    return this.yesim.getOrders(search);
  }

  @Post('yesim/issue-bulk')
  issueBulk(
    @Body() body: { planId: string; count: number; voucher?: boolean },
  ) {
    return this.admin.issueBulkEsims(body);
  }

  @Post('yesim/register-webhook')
  registerYesimWebhook(@Body() body: { url: string }) {
    return this.admin.registerYesimWebhook(body.url);
  }

  // ===== Orders & DPay Operations =====
  @Get('orders')
  listOrders(@Query('status') status?: string) {
    return this.admin.listOrders(status);
  }

  @Post('orders/:id/retry-provision')
  retryProvision(@Param('id') id: string) {
    return this.admin.retryOrderProvisioning(id);
  }

  @Post('orders/:id/verify-dpay')
  verifyDpay(
    @Param('id') id: string,
    @Body() body: { externalPaymentRef: string },
  ) {
    return this.admin.verifyOrderDpay(id, body.externalPaymentRef);
  }

  @Post('orders/:id/cancel-dpay')
  cancelDpay(@Param('id') id: string) {
    return this.admin.cancelOrderDpay(id);
  }

  @Post('orders/:id/refund-dpay')
  refundDpay(@Param('id') id: string, @Body() body: { reason?: string }) {
    return this.admin.refundOrderDpay(id, body?.reason);
  }

  @Post('dpay/register-webhook')
  registerDpayWebhook(@Body() body: { url: string }) {
    return this.admin.registerDpayWebhook(body.url);
  }

  // ===== eSIM Lifecycle Actions =====
  @Get('esims')
  listEsims(@Query('search') search?: string) {
    return this.admin.listEsims(search);
  }

  @Post('esims/:id/sync')
  syncEsim(@Param('id') id: string) {
    return this.admin.syncEsim(id);
  }

  @Post('esims/:id/add-plan')
  addPlan(@Param('id') id: string, @Body() body: { planId: string }) {
    return this.admin.addPlanToEsim(id, body.planId);
  }

  @Post('esims/:id/cancel-plan')
  cancelPlan(@Param('id') id: string) {
    return this.admin.cancelEsimPlan(id);
  }

  @Post('esims/:id/replace')
  replaceEsim(@Param('id') id: string) {
    return this.admin.replaceEsim(id);
  }

  // ===== Settings & Webhook Logs =====
  @Get('settings')
  getSettings() {
    return this.admin.getSettingsMasked();
  }

  @Patch('settings')
  updateSettings(@Body() dto: UpdateStoreSettingsDto) {
    return this.admin.updateSettings(dto);
  }

  @Get('webhooks')
  listWebhooks() {
    return this.admin.listWebhookEvents();
  }
}
