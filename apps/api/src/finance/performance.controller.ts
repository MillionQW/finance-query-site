import { Body, Controller, Delete, Get, Inject, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import { FinanceStoreService } from './finance-store.service';

@Controller('portfolio-performance')
export class PerformanceController {
  constructor(@Inject(FinanceStoreService) private readonly store: FinanceStoreService) {}
  @Get()
  get() { return this.store.performance.get(); }
  @Post()
  add(@Body() body: unknown) { return this.store.performance.save(null, body); }
  @Put(':id')
  update(@Param('id') id: string, @Body() body: unknown) { return this.store.performance.save(id, body); }
  @Delete(':id')
  remove(@Param('id') id: string, @Query('version', ParseIntPipe) version: number) { return this.store.performance.remove(id, version); }
}
