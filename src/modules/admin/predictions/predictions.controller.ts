import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Req,
  UseGuards,
} from '@nestjs/common';
import { PredictionsService } from './predictions.service';
import { CreatePredictionDto } from './dto/create-prediction.dto';
import { UpdatePredictionDto } from './dto/update-prediction.dto';
import { use } from 'passport';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';

@Controller('admin/predictions')
export class PredictionsController {
  constructor(private readonly predictionsService: PredictionsService) {}

  @UseGuards(JwtAuthGuard)
  @Post('create')
  create(@Req() req: any, @Body() createPredictionDto: CreatePredictionDto) {
    const user_id = req.user.userId;
    return this.predictionsService.create(user_id, createPredictionDto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('allPredictions')
  getAllPredictions(@Req() req: any) {
    const user_id = req.user.userId;
    return this.predictionsService.getAllPredictions(user_id);
  }

  @Get('getAll/:category_id')
  findAll(@Param('category_id') category_id: string) {
    return this.predictionsService.getAllWithcategoryId(category_id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updatePredictionDto: UpdatePredictionDto,
    @Req() req: any,
  ) {
    return this.predictionsService.update(
      id,
      updatePredictionDto,
      req.user.userId,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: any) {
    const user_id = req.user.userId;
    return this.predictionsService.remove(id, user_id);
  }
}
