import { Controller, Get, HttpCode, Inject, NotFoundException, Param, Post } from '@nestjs/common';
import { MacroService } from './macro.service';
import { MACRO_INDICATORS } from './macro.types';

@Controller('macro')
export class MacroController {
  constructor(@Inject(MacroService) private readonly macro: MacroService) {}

  @Get()
  read() {
    return this.macro.read();
  }

  @Get(':id')
  history(@Param('id') id: string) {
    const indicator = MACRO_INDICATORS.find(item => item.id === id);
    if (!indicator) throw new NotFoundException('未知宏观指标');
    return this.macro.history(indicator.id);
  }

  @Post('refresh')
  @HttpCode(202)
  refresh() {
    return { syncing: this.macro.refresh() };
  }
}
